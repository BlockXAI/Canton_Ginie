"""Spec Synthesis stage \u2014 derives a structured contract specification.

This sits between intent extraction and code generation. It produces a
machine-readable plan ("Spec") that:

1. Drives the writer agent \u2014 the spec is appended to the generation prompt
   as an explicit checklist, forcing the LLM to address every behaviour,
   every field, every invariant. It also lists *non-behaviours* (things
   the contract must NOT do) so the writer doesn't silently add them.

2. Drives the auditor (future stage) \u2014 the spec is the ground-truth
   checklist the audit can mechanically verify the code against.

3. Is surfaced in the UI ("Plan" panel on /sandbox/[jobId]) so users see
   the reasoning before the code is written and can spot problems early.

Failure mode is best-effort: if the LLM call or JSON parse fails, this
stage returns ``None`` and the pipeline continues with the original
intent only. It must never block code generation.
"""

from __future__ import annotations

import json
import re
import structlog
from typing import Any, Optional

from utils.llm_client import call_llm

logger = structlog.get_logger()


_SPEC_SYSTEM_PROMPT = """You are a senior smart-contract architect. Given a user's
plain-English description and a coarse intent extraction, produce a precise,
machine-readable specification for a Daml contract on Canton Network.

Your output is a contract *plan* \u2014 not the code itself. The plan will be used
as a strict checklist by the code generator and auditor downstream, so it
must be correct, exhaustive, and self-consistent.

Domain mapping rules (most important):
- "badge", "award", "credential", "certificate", "diploma", "membership",
  "attestation", "soulbound" -> domain="credential", pattern="soulbound-credential"
  (non-transferable). Required fields typically include name, description,
  issuedAt, criteria, optional metadataUri.
- "bond", "note", "debt", "coupon", "principal" -> domain="finance",
  pattern="bond-tokenization".
- "share", "equity", "stock", "dividend" -> domain="finance", pattern="equity-token".
- "escrow", "hold", "release on condition" -> domain="payments", pattern="escrow".
- "auction", "bid" -> domain="finance", pattern="auction".
- "vote", "proposal", "ballot", "governance" -> domain="governance".
- "supply chain", "shipment", "provenance" -> domain="supply-chain".
- "nft", "collectible", "art piece" -> domain="rights", pattern="nft".

Behaviour expansion rules:
- "stays forever / nobody can take / cannot be transferred" ->
  add a Transfer entry to **non_behaviours** (NOT to behaviours). The
  contract MUST NOT contain any choice that creates a copy with a different
  signatory/observer.
- "issuer can revoke / take back / cancel" -> add a Revoke choice with
  controller=issuer, effect=archive.
- "recipient must accept / consent / opt in" -> add an Accept choice with
  controller=recipient, effect=co-sign (Propose-Accept pattern).
- "anyone can verify / read" -> add the recipient as observer; do not add
  a query choice (templates are already publicly readable to observers).
- If the prompt is ambiguous, default to the SAFER behaviour (e.g. require
  Accept, omit Transfer).

Non-behaviour rules:
- ALWAYS state explicitly what the contract MUST NOT do, including the
  Daml choices that should NOT exist. This is critical \u2014 soulbound
  credentials must omit Transfer, etc.

Field rules:
- Do NOT invent a numeric `amount` field for non-financial contracts.
  Credentials, badges, memberships, NFTs do not need an `amount`.
- Always include `issuedAt : Time` for credentials/certificates.
- Always include a human-readable `name` or `title` field.

Output ONLY a single JSON object that matches this schema. No prose, no
markdown fences:

{
  "domain": "credential | finance | governance | supply-chain | rights | payments | identity | other",
  "pattern": "<short kebab-case identifier, e.g. soulbound-credential>",
  "title": "<3-6 word human title for the contract>",
  "summary": "<1-2 sentence plain-English summary of what is being built>",
  "rationale": "<2-4 sentences explaining the inferred design \u2014 why this pattern, why these behaviours, why these non-behaviours>",
  "parties": [
    {"name": "issuer", "role": "<one-line role description>", "is_signatory": true, "is_observer": false}
  ],
  "fields": [
    {"name": "badgeName", "type": "Text", "required": true, "purpose": "<one-line>"}
  ],
  "behaviours": [
    {"name": "Award", "controller": "issuer", "effect": "create", "description": "<one-line>"}
  ],
  "non_behaviours": [
    {"name": "Transfer", "reason": "<why this is intentionally absent>"}
  ],
  "invariants": [
    "issuer /= recipient",
    "badgeName is non-empty"
  ],
  "test_scenarios": [
    "issuer awards badge -> recipient accepts -> contract live",
    "issuer revokes -> contract archived",
    "recipient cannot transfer (no Transfer choice exists)"
  ]
}

Hard rules:
- Output is a SINGLE JSON object. Use double quotes only. No trailing commas.
- "fields" excludes party fields (those are in "parties").
- Use Daml types: Text, Decimal, Int, Time, Date, Bool, Optional Text, Party.
- Every behaviour controller must be a party listed in "parties".
- behaviours.length >= 1.
- Prefer 3-8 fields, 2-5 behaviours, 1-3 non_behaviours, 2-4 invariants,
  3-5 test_scenarios.
- Be concise: descriptions are one line each.
"""


def synthesize_spec(user_input: str, structured_intent: dict | None) -> Optional[dict[str, Any]]:
    """Best-effort: returns a spec dict, or None on failure.

    The pipeline must keep working even if this returns None \u2014 the writer
    agent falls back to the legacy intent-only prompt in that case.
    """
    intent_summary = ""
    if isinstance(structured_intent, dict):
        intent_summary = json.dumps({
            "contract_type":  structured_intent.get("contract_type"),
            "parties":        structured_intent.get("parties"),
            "features":       structured_intent.get("features"),
            "description":    structured_intent.get("description"),
            "needs_proposal": structured_intent.get("needs_proposal"),
        })

    user_msg = (
        f"User prompt:\n{user_input}\n\n"
        f"Coarse intent:\n{intent_summary or '(none)'}\n\n"
        "Produce the contract Spec JSON now."
    )

    try:
        raw = call_llm(
            system_prompt=_SPEC_SYSTEM_PROMPT,
            user_message=user_msg,
            max_tokens=2048,
        )
    except Exception as e:
        logger.warning("Spec synthesis LLM call failed", error=str(e))
        return None

    spec = _parse_json_loose(raw)
    if not spec:
        logger.warning("Spec synthesis produced unparseable output", preview=(raw or "")[:200])
        return None

    spec = _normalise_spec(spec)
    if not spec.get("behaviours"):
        # An empty behaviours list means the model gave us nothing usable \u2014
        # fall back rather than feed an empty checklist to the writer.
        logger.warning("Spec synthesis produced no behaviours, discarding")
        return None

    logger.info(
        "Spec synthesised",
        domain=spec.get("domain"),
        pattern=spec.get("pattern"),
        n_parties=len(spec.get("parties") or []),
        n_fields=len(spec.get("fields") or []),
        n_behaviours=len(spec.get("behaviours") or []),
        n_non_behaviours=len(spec.get("non_behaviours") or []),
    )
    return spec


def _parse_json_loose(raw: str) -> Optional[dict[str, Any]]:
    if not raw:
        return None
    text = raw.strip()
    # Strip markdown fences if present
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    # Find the first balanced {...} block
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        return None
    candidate = text[first:last + 1]
    try:
        data = json.loads(candidate)
        if isinstance(data, dict):
            return data
    except Exception:
        return None
    return None


def _normalise_spec(spec: dict[str, Any]) -> dict[str, Any]:
    """Coerce values to expected shapes & strip junk so the rest of the
    pipeline can rely on simple key lookups."""
    out: dict[str, Any] = {}
    out["domain"] = str(spec.get("domain") or "other").strip()[:64]
    out["pattern"] = str(spec.get("pattern") or "generic").strip()[:64]
    out["title"] = str(spec.get("title") or "").strip()[:120]
    out["summary"] = str(spec.get("summary") or "").strip()[:600]
    out["rationale"] = str(spec.get("rationale") or "").strip()[:1500]
    out["parties"] = _list_of_dicts(
        spec.get("parties"),
        keys={"name", "role", "is_signatory", "is_observer"},
    )
    out["fields"] = _list_of_dicts(
        spec.get("fields"),
        keys={"name", "type", "required", "purpose"},
    )
    out["behaviours"] = _list_of_dicts(
        spec.get("behaviours"),
        keys={"name", "controller", "effect", "description"},
    )
    out["non_behaviours"] = _list_of_dicts(
        spec.get("non_behaviours"),
        keys={"name", "reason"},
    )
    out["invariants"] = [
        str(s).strip() for s in (spec.get("invariants") or []) if isinstance(s, str)
    ][:8]
    out["test_scenarios"] = [
        str(s).strip() for s in (spec.get("test_scenarios") or []) if isinstance(s, str)
    ][:8]
    return out


def _list_of_dicts(raw: Any, keys: set[str]) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        clean: dict[str, Any] = {}
        for k in keys:
            if k in item:
                clean[k] = item[k]
        if clean:
            out.append(clean)
    return out


def format_spec_for_prompt(spec: dict[str, Any] | None) -> str:
    """Render the spec as a plain-text checklist to inject into the writer
    agent's user message. Goal: every line maps to a concrete code element
    the model must produce (or, in the case of non-behaviours, a thing it
    must NOT produce).
    """
    if not spec:
        return ""
    lines: list[str] = []
    lines.append("CONTRACT PLAN (machine-derived spec \u2014 your code MUST honour every line):")
    if spec.get("title"):
        lines.append(f"Title: {spec['title']}")
    if spec.get("summary"):
        lines.append(f"Summary: {spec['summary']}")
    if spec.get("pattern"):
        lines.append(f"Pattern: {spec['pattern']} (domain={spec.get('domain', 'other')})")

    parties = spec.get("parties") or []
    if parties:
        lines.append("\nParties:")
        for p in parties:
            tags: list[str] = []
            if p.get("is_signatory"):
                tags.append("signatory")
            if p.get("is_observer"):
                tags.append("observer")
            tag_str = f" [{', '.join(tags)}]" if tags else ""
            lines.append(f"  - {p.get('name', '?')}{tag_str}: {p.get('role', '')}")

    fields = spec.get("fields") or []
    if fields:
        lines.append("\nFields (must appear in `with` block):")
        for f in fields:
            req = "" if f.get("required") is False else " (required)"
            lines.append(
                f"  - {f.get('name', '?')} : {f.get('type', 'Text')}{req} \u2014 {f.get('purpose', '')}"
            )

    behaviours = spec.get("behaviours") or []
    if behaviours:
        lines.append("\nBehaviours (must appear as `choice`s):")
        for b in behaviours:
            lines.append(
                f"  - {b.get('name', '?')} (controller={b.get('controller', '?')}, "
                f"effect={b.get('effect', '?')}): {b.get('description', '')}"
            )

    non_behaviours = spec.get("non_behaviours") or []
    if non_behaviours:
        lines.append("\nNon-behaviours (must NOT appear \u2014 do not generate these choices):")
        for nb in non_behaviours:
            lines.append(f"  - {nb.get('name', '?')} \u2014 {nb.get('reason', 'intentionally absent')}")

    invariants = spec.get("invariants") or []
    if invariants:
        lines.append("\nInvariants (combine with && in the single `ensure` clause):")
        for inv in invariants:
            lines.append(f"  - {inv}")

    return "\n".join(lines)
