"""
Deterministic DAML parser and Mermaid diagram generator.

Parses DAML source code using regex (NOT LLM-based) to extract:
- Template names, signatory/observer lists
- Choices with controllers and return types
- ``create`` statements inside ``do`` blocks

Then generates a Mermaid flowchart showing contract workflows.
"""

from __future__ import annotations

import re
import structlog

logger = structlog.get_logger()


def parse_daml_for_diagram(daml_code: str | dict) -> dict:
    """Parse DAML code into a structured diagram spec.

    *daml_code* can be a single string (single-template mode) or a dict
    of ``{filename: code}`` (project mode).

    Returns::

        {
            "templates": [
                {
                    "name": "Bond",
                    "signatories": ["issuer"],
                    "observers": ["investor"],
                    "choices": [
                        {"name": "Transfer", "controller": "owner",
                         "return_type": "ContractId Bond", "creates": ["Bond"]},
                    ],
                },
            ],
            "parties": ["issuer", "investor", "owner"],
            "flows": [
                {"from": "Bond", "to": "Bond", "label": "Transfer",
                 "controller": "owner", "type": "state_transition"},
            ],
        }
    """
    # Normalise input to list of code strings
    if isinstance(daml_code, dict):
        code_blocks = list(daml_code.values())
    else:
        code_blocks = [daml_code]

    all_templates: list[dict] = []
    all_parties: set[str] = set()

    for code in code_blocks:
        if not code:
            continue
        templates = _parse_templates(code)
        all_templates.extend(templates)
        for t in templates:
            all_parties.update(t["signatories"])
            all_parties.update(t["observers"])
            for ch in t["choices"]:
                if ch["controller"]:
                    all_parties.add(ch["controller"])

    flows = _derive_flows(all_templates)

    return {
        "templates": all_templates,
        "parties": sorted(all_parties),
        "flows": flows,
    }


def generate_mermaid(diagram_spec: dict) -> str:
    """Convert a diagram spec into a Mermaid flowchart string."""
    templates = diagram_spec.get("templates", [])
    flows = diagram_spec.get("flows", [])
    parties = diagram_spec.get("parties", [])

    if not templates:
        return ""

    lines: list[str] = ["flowchart TD"]

    # Subgraph for parties
    if parties:
        lines.append("  subgraph Parties")
        for p in parties:
            pid = _mermaid_id(f"party_{p}")
            lines.append(f"    {pid}([{p}])")
        lines.append("  end")
        lines.append("")

    # Template nodes
    lines.append("  subgraph Contracts")
    for t in templates:
        tid = _mermaid_id(t["name"])
        is_proposal = "Proposal" in t["name"]
        if is_proposal:
            lines.append(f"    {tid}{{{{{t['name']}}}}}")  # diamond shape
        else:
            lines.append(f"    {tid}[{t['name']}]")
    lines.append("  end")
    lines.append("")

    # Signatory edges (party → template)
    for t in templates:
        tid = _mermaid_id(t["name"])
        for sig in t["signatories"]:
            pid = _mermaid_id(f"party_{sig}")
            lines.append(f"  {pid} -->|signatory| {tid}")

    # Observer edges
    for t in templates:
        tid = _mermaid_id(t["name"])
        for obs in t["observers"]:
            if obs not in t["signatories"]:
                pid = _mermaid_id(f"party_{obs}")
                lines.append(f"  {pid} -.->|observer| {tid}")

    lines.append("")

    # Choice / flow edges
    for flow in flows:
        fid = _mermaid_id(flow["from"])
        to_id = _mermaid_id(flow["to"])
        label = _sanitize_label(flow["label"])
        ctrl = _sanitize_label(flow.get("controller", ""))
        flow_type = flow.get("type", "")
        edge_label = f"\"{label}<br/>{ctrl}\"" if ctrl else f"\"{label}\""

        if flow_type == "proposal_accept":
            lines.append(f"  {fid} ==>|{edge_label}| {to_id}")
        elif flow_type == "proposal_reject":
            lines.append(f"  {fid} -.-x|{edge_label}| {to_id}")
        elif flow["from"] == flow["to"]:
            lines.append(f"  {fid} -->|{edge_label}| {fid}")
        else:
            lines.append(f"  {fid} -->|{edge_label}| {to_id}")

    # Styling
    lines.append("")
    lines.append("  classDef proposal fill:#f9f,stroke:#333,stroke-width:2px")
    lines.append("  classDef core fill:#bbf,stroke:#333,stroke-width:2px")
    for t in templates:
        tid = _mermaid_id(t["name"])
        if "Proposal" in t["name"]:
            lines.append(f"  class {tid} proposal")
        else:
            lines.append(f"  class {tid} core")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Internal parsing helpers
# ---------------------------------------------------------------------------

def _parse_templates(code: str) -> list[dict]:
    """Extract all templates from a single DAML source string."""
    templates: list[dict] = []

    # Split code into template blocks
    template_starts = list(re.finditer(r"^template\s+(\w+)", code, re.MULTILINE))

    for idx, match in enumerate(template_starts):
        name = match.group(1)
        start = match.start()
        end = template_starts[idx + 1].start() if idx + 1 < len(template_starts) else len(code)
        block = code[start:end]

        signatories = _extract_parties(block, "signatory")
        observers = _extract_parties(block, "observer")
        choices = _extract_choices(block)

        templates.append({
            "name": name,
            "signatories": signatories,
            "observers": observers,
            "choices": choices,
        })

    return templates


def _extract_parties(block: str, keyword: str) -> list[str]:
    """Extract party names from signatory/observer declarations."""
    match = re.search(rf"^\s+{keyword}\s+(.+)$", block, re.MULTILINE)
    if not match:
        return []
    raw = match.group(1).strip()
    # Handle comma-separated and "party1, party2" patterns
    parties = re.findall(r"\b([a-z][a-zA-Z0-9_]*)\b", raw)
    return parties


def _extract_choices(block: str) -> list[dict]:
    """Extract all choices from a template block."""
    choices: list[dict] = []
    choice_pattern = re.compile(
        r"^\s+choice\s+(\w+)\s*:\s*(.+)$", re.MULTILINE
    )

    for match in choice_pattern.finditer(block):
        choice_name = match.group(1)
        return_type = match.group(2).strip()

        # Find the controller for this choice (search forward from the choice line)
        choice_start = match.start()
        rest = block[choice_start:]
        ctrl_match = re.search(r"^\s+controller\s+(\w+)", rest, re.MULTILINE)
        controller = ctrl_match.group(1) if ctrl_match else ""

        # Find `create` statements in the `do` block
        do_match = re.search(r"^\s+do\s*$", rest, re.MULTILINE)
        creates: list[str] = []
        if do_match:
            do_block = rest[do_match.start():]
            # Find all `create X with` or `create this with`
            for cm in re.finditer(r"\bcreate\s+(\w+)\s+with\b", do_block):
                target = cm.group(1)
                if target == "this":
                    # "create this with" means same template
                    tmpl_match = re.search(r"^template\s+(\w+)", block, re.MULTILINE)
                    if tmpl_match:
                        creates.append(tmpl_match.group(1))
                else:
                    creates.append(target)

        choices.append({
            "name": choice_name,
            "controller": controller,
            "return_type": return_type,
            "creates": creates,
        })

    return choices


def _derive_flows(templates: list[dict]) -> list[dict]:
    """Derive flow edges from parsed templates and their choices."""
    flows: list[dict] = []
    template_names = {t["name"] for t in templates}

    for t in templates:
        for ch in t["choices"]:
            is_proposal_tmpl = "Proposal" in t["name"]

            if ch["creates"]:
                for target in ch["creates"]:
                    if target in template_names:
                        flow_type = "state_transition"
                        if is_proposal_tmpl and "Accept" in ch["name"]:
                            flow_type = "proposal_accept"
                        elif is_proposal_tmpl and "Reject" in ch["name"]:
                            flow_type = "proposal_reject"

                        flows.append({
                            "from": t["name"],
                            "to": target,
                            "label": ch["name"],
                            "controller": ch["controller"],
                            "type": flow_type,
                        })
            else:
                # Choice that doesn't create — self-referencing or archive
                if "return ()" in ch.get("return_type", "") or ch["return_type"] == "()":
                    if is_proposal_tmpl and ("Reject" in ch["name"] or "Cancel" in ch["name"]):
                        flows.append({
                            "from": t["name"],
                            "to": "Archive",
                            "label": ch["name"],
                            "controller": ch["controller"],
                            "type": "proposal_reject",
                        })
                    else:
                        flows.append({
                            "from": t["name"],
                            "to": t["name"],
                            "label": ch["name"],
                            "controller": ch["controller"],
                            "type": "action",
                        })
                elif "ContractId" in ch["return_type"]:
                    # Returns a ContractId — likely creates same template
                    flows.append({
                        "from": t["name"],
                        "to": t["name"],
                        "label": ch["name"],
                        "controller": ch["controller"],
                        "type": "state_transition",
                    })

    return flows


def _sanitize_label(text: str) -> str:
    """Sanitize text for use in Mermaid edge labels.

    Removes or replaces characters that break Mermaid's parser:
    parentheses, brackets, pipes, quotes, newlines, etc.
    """
    if not text:
        return ""
    text = text.replace("\n", " ").replace("\r", "")
    text = text.replace('"', "'")
    text = text.replace("|", "/")
    text = re.sub(r"[()[\]{}]", "", text)
    return text.strip()


def _mermaid_id(name: str) -> str:
    """Convert a name to a valid Mermaid node ID."""
    return re.sub(r"[^a-zA-Z0-9_]", "_", name)
