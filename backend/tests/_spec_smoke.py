"""Smoke check for spec_synth parsing + formatting helpers.

Run from repo root:
    backend/venv/Scripts/python.exe backend/tests/_spec_smoke.py

This is intentionally NOT pytest-discovered (filename starts with _) so it
doesn't run in CI by default.
"""
import sys
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from pipeline.spec_synth import _parse_json_loose, _normalise_spec, format_spec_for_prompt  # noqa: E402

RAW = """```json
{
  "domain": "credential",
  "pattern": "soulbound-credential",
  "title": "Achievement Badge",
  "summary": "Issuer awards a non-transferable badge to a recipient.",
  "rationale": "User said the badge stays forever and nobody can take it; that is the soulbound credential pattern.",
  "parties": [
    {"name": "issuer",    "role": "the company awarding the badge", "is_signatory": true, "is_observer": false},
    {"name": "recipient", "role": "the person receiving the badge", "is_signatory": false, "is_observer": true}
  ],
  "fields": [
    {"name": "badgeName",    "type": "Text", "required": true,  "purpose": "human-readable badge title"},
    {"name": "description",  "type": "Text", "required": true,  "purpose": "what the badge recognises"},
    {"name": "issuedAt",     "type": "Time", "required": true,  "purpose": "issuance timestamp"},
    {"name": "metadataUri",  "type": "Optional Text", "required": false, "purpose": "off-chain metadata"}
  ],
  "behaviours": [
    {"name": "Award",  "controller": "issuer",    "effect": "create",  "description": "issuer mints the badge"},
    {"name": "Accept", "controller": "recipient", "effect": "co-sign", "description": "recipient acknowledges the badge"},
    {"name": "Revoke", "controller": "issuer",    "effect": "archive", "description": "issuer revokes the badge"}
  ],
  "non_behaviours": [
    {"name": "Transfer", "reason": "soulbound \u2014 non-transferable by design"}
  ],
  "invariants": [
    "issuer /= recipient",
    "badgeName is non-empty"
  ],
  "test_scenarios": [
    "issuer awards -> recipient accepts -> contract live",
    "issuer revokes -> contract archived",
    "recipient cannot transfer (no Transfer choice exists)"
  ]
}
```
"""

def main() -> None:
    parsed = _parse_json_loose(RAW)
    assert parsed is not None, "JSON parse failed"
    spec = _normalise_spec(parsed)
    assert spec["pattern"] == "soulbound-credential"
    assert len(spec["behaviours"]) == 3
    assert len(spec["non_behaviours"]) == 1
    out = format_spec_for_prompt(spec)
    assert "Non-behaviours" in out
    assert "Transfer" in out
    assert "Award" in out
    print("spec_synth smoke OK")
    print("---")
    print(out)


if __name__ == "__main__":
    main()
