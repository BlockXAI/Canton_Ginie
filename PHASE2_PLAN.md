# Phase 2: Advanced Contract Generation — Implementation Plan

## Current State (Phase 1 Complete)

- **Pipeline**: intent → RAG → generate → compile → fix/fallback → audit → deploy
- **Writer agent**: generates **one template per request**, module named `Main`, single file `daml/Main.daml`
- **Compile agent**: writes single `Main.daml`, runs `daml build`
- **Fix agent**: receives one file + errors, LLM rewrites
- **Deploy agent**: assumes `Main:<TemplateName>`, allocates throwaway parties, creates contract directly
- **Intent agent**: returns flat `daml_templates_needed[]` and `suggested_choices[]`
- **Audit**: runs after compile, checks generated code for vulnerabilities

---

## Task 2.4 — Pre-Audit Security Rules in Generation (Days 1–2)

### Why First
Quick win. Improves every subsequent contract generated. No pipeline changes needed.

### Files to Create

**`backend/security/generation_rules.py`**
```
GENERATION_SECURITY_RULES = [
    {
        "id": "SEC-GEN-001",
        "rule": "All Party fields must be validated as distinct in ensure clause",
        "example": "ensure issuer /= investor",
        "severity": "high",
    },
    {
        "id": "SEC-GEN-002",
        "rule": "All Decimal fields for financial amounts must have positive value + upper bound constraints",
        "example": "ensure amount > 0.0 && amount <= 1000000000.0",
        "severity": "high",
    },
    {
        "id": "SEC-GEN-003",
        "rule": "Consuming choices that transfer ownership must create a new contract",
        "example": "choice Transfer : ContractId Bond ... do create this with owner = newOwner",
        "severity": "critical",
    },
    {
        "id": "SEC-GEN-004",
        "rule": "Observer fields must never overlap with signatory fields",
        "example": "ensure observer /= signatory",
        "severity": "medium",
    },
    {
        "id": "SEC-GEN-005",
        "rule": "Every choice must have explicit controller authorization",
        "example": "controller investor",
        "severity": "high",
    },
    # ~10-15 rules total
]

def format_rules_for_prompt() -> str:
    """Format rules as mandatory constraints for the writer agent system prompt."""
```

### Files to Modify

**`backend/agents/writer_agent.py`**
- Import `format_rules_for_prompt()` from `security/generation_rules.py`
- Append the formatted rules block to `WRITER_SYSTEM_PROMPT` (after ABSOLUTE RULES section)
- Rules are injected as: `MANDATORY SECURITY REQUIREMENTS (violations will fail audit):\n1. ...\n2. ...`

### Verification
- Generate a bond contract before and after the change
- Compare audit security scores — expect jump from ~70-80 to ~85-95
- Verify `ensure` clauses include party distinctness and amount bounds

---

## Task 2.2 — Propose-Accept Auto-Generation (Days 3–5)

### Why Before 2.1
The propose-accept pattern is the most critical quality improvement. It makes contracts production-ready on Canton where multi-signatory contracts cannot be created directly.

### Detection Logic

**`backend/agents/intent_agent.py`** — Modify

Add to `INTENT_SYSTEM_PROMPT` example output:
```json
{
  "needs_proposal": true,
  "initiator_party": "issuer",
  "acceptor_parties": ["investor"],
  ...existing fields...
}
```

Detection rules (add to system prompt):
- If 2+ parties are listed as signatories → `needs_proposal: true`
- The party who "creates" or "issues" → `initiator_party`
- The party who "accepts" or "receives" → `acceptor_parties`
- If 3+ signatories → flag `multi_party_agreement: true` (for Task 2.1)

Add to `_fallback_intent()`:
```python
"needs_proposal": False,
"initiator_party": "owner",
"acceptor_parties": [],
```

### Generation Logic

**`backend/agents/writer_agent.py`** — Modify

When `structured_intent.get("needs_proposal")` is True:

1. Add a fixed **canonical propose-accept pattern** to the system prompt (not from RAG — too important):
```
PROPOSE-ACCEPT PATTERN (MANDATORY when needs_proposal is true):
You MUST generate TWO templates:
1. A Proposal template (signatory = initiator only, observer = acceptor)
   with choices: Accept (creates the final contract), Reject, Cancel
2. The final Agreement template (signatory = both parties)
   with business logic choices

The Proposal template carries the initiator's authority. When the acceptor
exercises Accept, their authority is added, allowing creation of the
multi-signatory agreement.
```

2. Relax the "exactly ONE template" constraint when `needs_proposal` is true — allow exactly TWO templates
3. Update `_validate_daml()` to allow 2 templates when proposal mode is on
4. Update `_auto_fix_structure()` to not strip the second template in proposal mode

### Key Code Changes in `writer_agent.py`

```python
def run_writer_agent(structured_intent, rag_context=None):
    needs_proposal = structured_intent.get("needs_proposal", False)
    initiator = structured_intent.get("initiator_party", parties[0])
    acceptors = structured_intent.get("acceptor_parties", [parties[1]])

    if needs_proposal:
        # Use proposal-aware prompt
        system_prompt = WRITER_SYSTEM_PROMPT + PROPOSE_ACCEPT_ADDENDUM
        # Allow two templates
        max_templates = 2
    else:
        system_prompt = WRITER_SYSTEM_PROMPT
        max_templates = 1

    # ... rest of generation with max_templates passed to validation
```

### Deploy Agent Changes

**`backend/agents/deploy_agent.py`** — Modify

When proposal mode is detected (check if generated code contains a `Proposal` template):
- Create the **Proposal** contract (not the final agreement)
- Use the initiator party as the signatory for the create command
- Return both the proposal contract ID and instructions for the user to exercise Accept

### Verification
- Prompt: "Create a loan agreement between a bank and a borrower"
- Expected: TWO templates generated — `LoanProposal` + `Loan`
- `LoanProposal` has `signatory bank`, `observer borrower`, choices `Accept`/`Reject`/`Cancel`
- `Loan` has `signatory bank, borrower`
- Deploy creates the Proposal, not the Loan directly

---

## Task 2.1 — Multi-Template Project Generation (Days 6–15)

### Overview
This is the largest task. Transforms Ginie from single-template toy output to complete multi-file DAML projects.

### Step 1: Intent Agent — Project Mode Detection (Days 6–7)

**`backend/agents/intent_agent.py`** — Modify

Add to system prompt example output:
```json
{
  "project_mode": true,
  "templates": [
    {
      "name": "Bond",
      "module": "Bond",
      "role": "core",
      "parties": ["issuer", "investor"],
      "signatories": ["issuer", "investor"],
      "choices": ["Transfer", "PayCoupon", "Redeem"],
      "depends_on": []
    },
    {
      "name": "BondProposal",
      "module": "Bond.Proposal",
      "role": "proposal",
      "parties": ["issuer", "investor"],
      "signatories": ["issuer"],
      "choices": ["Accept", "Reject", "Cancel"],
      "depends_on": ["Bond"],
      "creates_on_accept": "Bond"
    }
  ],
  "shared_types": {
    "module": "Types",
    "types": ["BondStatus", "Currency"]
  },
  ...existing fields...
}
```

Detection heuristics (add to system prompt):
- `project_mode: true` when: complexity is "high", OR 3+ features requested, OR contract type is bond/trade/settlement
- Single-template requests keep `project_mode: false` (backward compatible)

Add to `_fallback_intent()`:
```python
"project_mode": False,
"templates": [],
"shared_types": None,
```

### Step 2: Project Writer Agent (Days 8–10)

**`backend/agents/project_writer_agent.py`** — Create NEW

This agent replaces the single-file writer when `project_mode` is true. It generates files in stages:

```python
def run_project_writer_agent(structured_intent: dict, rag_context: list[str]) -> dict:
    """
    Multi-stage generation:
    1. Generate shared types module (data types, enums)
    2. Generate core template (main business object)
    3. Generate supporting templates (proposals, lifecycle, transfers)
    Each stage includes previously generated code as context.
    Returns: {"success": bool, "files": {"daml/Bond.daml": "...", "daml/Types.daml": "...", ...}}
    """
```

**Stage 1**: Generate `Types.daml` (shared types)
- Small file, compiles independently
- Prompt: "Generate a DAML module with data types: {types}" + security rules

**Stage 2**: Generate core template
- Imports Types module
- Prompt includes Types.daml as context + RAG patterns
- Uses main template from intent's `templates` list where `role == "core"`

**Stage 3**: Generate supporting templates (one per LLM call)
- Each imports core template + Types
- Prompt includes all previously generated files as context
- Generated in dependency order based on `depends_on` field

Each generation is a separate `call_llm()` with the previously generated code appended as context.

**Return format**:
```python
{
    "success": True,
    "files": {
        "daml/Types.daml": "module Types where\n...",
        "daml/Bond.daml": "module Bond where\nimport Types\n...",
        "daml/Bond/Proposal.daml": "module Bond.Proposal where\nimport Bond\n...",
    },
    "daml_yaml": "sdk-version: 2.9.3\nname: bond-project\nsource: daml\n...",
}
```

### Step 3: Pipeline Orchestrator — Project Mode Routing (Day 10)

**`backend/pipeline/orchestrator.py`** — Modify

Add a routing check after RAG node:

```python
def _route_after_rag(state: dict) -> Literal["generate", "generate_project"]:
    if state.get("structured_intent", {}).get("project_mode"):
        return "generate_project"
    return "generate"
```

Add new `generate_project_node`:
```python
def generate_project_node(state: dict) -> dict:
    result = run_project_writer_agent(
        structured_intent=state["structured_intent"],
        rag_context=state.get("rag_context", []),
    )
    if not result["success"]:
        return {**state, "is_fatal_error": True, ...}
    return {
        **state,
        "generated_code": result["files"],  # dict of filename → code
        "project_mode": True,
        "daml_yaml": result.get("daml_yaml", ""),
        ...
    }
```

Both `generate` and `generate_project` flow into `compile`.

### Step 4: Compile Agent — Multi-File Support (Day 11)

**`backend/agents/compile_agent.py`** — Modify

When `state.get("project_mode")`:
- Write multiple files into the sandbox directory structure
- Generate `daml.yaml` with `source: daml` pointing to the source root
- Run `daml build` on the whole project
- Parse errors — extract which file + line number failed

```python
async def run_compile_agent_project(sandbox, files: dict, daml_yaml: str):
    """Write all files and compile the multi-file project."""
    for path, content in files.items():
        await sandbox.files.write(path, content)
    if daml_yaml:
        await sandbox.files.write("daml.yaml", daml_yaml)
    # daml build compiles all files in source dir
    result = await sandbox.compile()
    # Parse errors: extract filename from error messages like "daml/Bond/Proposal.daml:15:3: error:"
    return result
```

### Step 5: Fix Agent — Multi-File Fixes (Day 12)

**`backend/agents/fix_agent.py`** — Modify

When project mode is active:
- Parse which file the error is in from the compilation error message
- Send to LLM: the broken file + all files it imports (for context) + error messages
- Fix only the broken file, not the whole project
- Return the updated file dict

### Step 6: Deploy Agent — Multi-Template DAR (Day 13)

**`backend/agents/deploy_agent.py`** — Modify

When the DAR contains multiple templates:
- Discover all template names from the DAR package (inspect the compiled output)
- Allocate parties for all unique party roles across all templates
- Create the **proposal** contract if one exists (not the final agreement)
- Return all template IDs and the proposal contract ID

### Step 7: Pipeline State Update (Day 6)

**`backend/pipeline/state.py`** — Modify

Add fields:
```python
project_mode: bool = False
project_files: dict = Field(default_factory=dict)  # {filename: code}
daml_yaml: str = ""
```

### Integration Testing (Days 14–15)

End-to-end test cases:
1. Simple prompt → single template (backward compatible, no project mode)
2. Complex prompt → multi-template project → compiled DAR
3. Bond issuance → Bond + BondProposal + CouponPayment → compiled DAR
4. Trade settlement → Trade + TradeProposal + Settlement → compiled DAR

### Verification
- Prompt: "Create a bond issuance platform with coupon payments and transfer"
- Expected output structure:
  ```
  daml/
  ├── Types.daml
  ├── Bond.daml
  ├── Bond/
  │   ├── Proposal.daml
  │   ├── Coupon.daml
  │   └── Transfer.daml
  └── daml.yaml
  ```
- All files compile together as one DAR
- Deploy creates BondProposal contract

---

## Task 2.3 — Visual Contract Flow Diagrams (Days 16–20)

### Overview
After code generation, render a Mermaid diagram showing the contract workflow.

### Step 1: DAML Parser (Day 16)

**`backend/agents/diagram_agent.py`** — Create NEW

Deterministic parser (NOT LLM-based) that extracts:
- Template names (regex: `^template\s+(\w+)`)
- Signatory/observer lists (regex: `signatory\s+(.+)`, `observer\s+(.+)`)
- Choices with controllers and return types (regex: `choice\s+(\w+)\s*:\s*(.+)`)
- `create` statements inside `do` blocks (what new contracts a choice produces)

```python
def parse_daml_for_diagram(daml_code: str | dict) -> dict:
    """
    Parse DAML code (single string or dict of files) into a structured diagram spec.
    Returns: {
        "templates": [...],
        "parties": [...],
        "flows": [{"from": ..., "to": ..., "label": ..., "controller": ...}],
    }
    """

def generate_mermaid(diagram_spec: dict) -> str:
    """Convert diagram spec to Mermaid diagram string."""
```

### Step 2: Pipeline Integration (Day 17)

**`backend/pipeline/orchestrator.py`** — Modify

Add `diagram_node` between `audit` and `deploy`:
```python
def diagram_node(state: dict) -> dict:
    code = state.get("generated_code", "")
    diagram = parse_daml_for_diagram(code)
    mermaid = generate_mermaid(diagram)
    return {**state, "diagram_mermaid": mermaid, "diagram_spec": diagram}
```

Update pipeline: `audit → diagram → deploy`

**`backend/pipeline/state.py`** — Add fields:
```python
diagram_mermaid: str = ""
diagram_spec: dict = Field(default_factory=dict)
```

**`backend/api/routes.py`** — Include `diagram_mermaid` in result response

**`backend/api/models.py`** — Add `diagram_mermaid: str | None` to `JobResultResponse`

### Step 3: Frontend Mermaid Renderer (Days 18–19)

**`saas-template/saas/package.json`** — Add `mermaid` dependency

**`saas-template/saas/components/mermaid-diagram.tsx`** — Create NEW

```tsx
"use client";
import { useEffect, useRef } from "react";
import mermaid from "mermaid";

export function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current && chart) {
      mermaid.initialize({ theme: "dark", ... });
      mermaid.render("mermaid-svg", chart).then(({ svg }) => {
        ref.current!.innerHTML = svg;
      });
    }
  }, [chart]);
  return <div ref={ref} className="..." />;
}
```

**`saas-template/saas/app/sandbox/[jobId]/page.tsx`** — Modify

Add a "Contract Flow" tab alongside code view. When `result.diagram_mermaid` exists, render `<MermaidDiagram chart={result.diagram_mermaid} />`.

### Step 4: Polish (Day 20)

- Handle multi-file diagrams (project mode: combine all files into one diagram)
- Edge cases: contracts with no choices, self-referencing choices
- Styling: color-code proposal flows vs business flows

### Verification
- Generate a bond contract → diagram shows: Issuer → BondProposal → (Accept by Investor) → Bond → Transfer/PayCoupon/Redeem
- Generate a simple transfer → diagram shows: Owner → SimpleContract → Transfer → SimpleContract

---

## Execution Timeline

```
Week 4 (Days 1–5):
  Day 1-2: Task 2.4 — Extract audit rules, inject into writer prompt
  Day 3-5: Task 2.2 — Propose-accept: intent detection + writer changes + deploy changes

Week 5 (Days 6–10):
  Day 6-7:  Task 2.1 Step 1 — Intent agent project_mode + template graph
  Day 8-10: Task 2.1 Step 2 — Project writer agent (multi-file generation)

Week 6 (Days 11–15):
  Day 11: Task 2.1 Step 4 — Compile agent multi-file support
  Day 12: Task 2.1 Step 5 — Fix agent multi-file support
  Day 13: Task 2.1 Step 6 — Deploy agent multi-template DAR
  Day 14-15: Integration testing (single → multi-template → full E2E)

Week 7 (Days 16–20):
  Day 16:    Task 2.3 Step 1 — DAML parser (deterministic, regex-based)
  Day 17:    Task 2.3 Step 2 — Pipeline diagram node + API response
  Day 18-19: Task 2.3 Step 3 — Frontend Mermaid renderer + diagram tab
  Day 20:    Task 2.3 Step 4 — Polish, edge cases, documentation
```

---

## Files Summary

### New Files (6)
| File | Task | Purpose |
|------|------|---------|
| `backend/security/generation_rules.py` | 2.4 | Structured audit rules for writer prompt injection |
| `backend/agents/project_writer_agent.py` | 2.1 | Multi-file DAML project generation (staged LLM calls) |
| `backend/agents/diagram_agent.py` | 2.3 | Deterministic DAML parser → Mermaid diagram generator |
| `saas-template/saas/components/mermaid-diagram.tsx` | 2.3 | React component for Mermaid rendering |

### Modified Files (12)
| File | Task | Change |
|------|------|--------|
| `backend/agents/intent_agent.py` | 2.1, 2.2 | Add `project_mode`, `needs_proposal`, template graph to output |
| `backend/agents/writer_agent.py` | 2.2, 2.4 | Propose-accept prompt, security rules injection, 2-template validation |
| `backend/agents/compile_agent.py` | 2.1 | Multi-file project compilation support |
| `backend/agents/fix_agent.py` | 2.1 | Per-file fixing with cross-file context |
| `backend/agents/deploy_agent.py` | 2.1, 2.2 | Multi-template DAR, proposal contract creation |
| `backend/pipeline/orchestrator.py` | 2.1, 2.3 | Project mode routing, diagram node |
| `backend/pipeline/state.py` | 2.1, 2.3 | Add project_mode, project_files, diagram fields |
| `backend/api/routes.py` | 2.3 | Include diagram_mermaid in result response |
| `backend/api/models.py` | 2.3 | Add diagram_mermaid to JobResultResponse |
| `saas-template/saas/app/sandbox/[jobId]/page.tsx` | 2.3 | Add diagram tab with Mermaid renderer |
| `saas-template/saas/package.json` | 2.3 | Add mermaid dependency |

### Backward Compatibility
- All changes are gated behind `project_mode` / `needs_proposal` flags
- Simple single-template prompts follow the existing code path unchanged
- `project_mode: false` is the default in all fallbacks
- No breaking changes to the `/generate`, `/status`, `/result` API contracts

---

## Risk Mitigation

1. **Multi-file compilation failures**: The fix loop already exists. For project mode, target the specific broken file. If all fix attempts fail, fallback to single-template generation (existing behavior).

2. **LLM context overflow in project writer**: Each file is generated in a separate LLM call with only the relevant imports as context. Max context per call stays under ~2000 tokens of reference code.

3. **Propose-accept pattern correctness**: The canonical pattern is hardcoded in the prompt (not retrieved from RAG). This ensures consistency regardless of RAG quality.

4. **Diagram parser edge cases**: The parser is deterministic (regex-based), not LLM-based. If it fails to parse, the diagram is simply omitted — no pipeline failure.
