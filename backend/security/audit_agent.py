"""
Enterprise Security Audit Agent for DAML Smart Contracts.

Performs LLM-based deep security analysis using industry frameworks
adapted for the Canton/DAML ecosystem (DSV, SWC, OWASP, CWE).
"""

import json
import re
import structlog
from datetime import datetime, timezone

from security.audit_prompts import DAML_SECURITY_AUDIT_PROMPT
from utils.llm_client import call_llm

logger = structlog.get_logger()


def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from LLM response, handling markdown fences."""
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        cleaned = re.sub(r"```json\s*", "", text)
        cleaned = re.sub(r"```\s*", "", cleaned)
        cleaned = cleaned.strip()
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                pass
    logger.warning("Failed to parse LLM audit response as JSON")
    return {}


def _compute_security_score(findings: list) -> int:
    """Compute security score from findings list."""
    score = 100
    for f in findings:
        sev = (f.get("severity") or "").upper()
        if sev == "CRITICAL":
            score -= 25
        elif sev == "HIGH":
            score -= 15
        elif sev == "MEDIUM":
            score -= 7
        elif sev == "LOW":
            score -= 3
    return max(0, score)


def _build_executive_summary(findings: list, score: int) -> dict:
    """Build executive summary from findings."""
    counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0, "OPT": 0}
    for f in findings:
        sev = (f.get("severity") or "INFO").upper()
        if sev in counts:
            counts[sev] += 1

    if counts["CRITICAL"] > 0:
        risk = "CRITICAL"
        rec = "DO_NOT_DEPLOY"
    elif counts["HIGH"] > 0:
        risk = "HIGH"
        rec = "REQUIRES_MAJOR_REFACTOR" if counts["HIGH"] > 2 else "NEEDS_FIXES"
    elif counts["MEDIUM"] > 3:
        risk = "MEDIUM"
        rec = "NEEDS_FIXES"
    elif score >= 85:
        risk = "LOW"
        rec = "DEPLOY_READY"
    else:
        risk = "MEDIUM"
        rec = "NEEDS_FIXES"

    key_findings = [
        f["title"]
        for f in findings
        if f.get("severity") in ("CRITICAL", "HIGH")
    ][:5]

    return {
        "overallRisk": risk,
        "securityScore": score,
        "criticalIssues": counts["CRITICAL"],
        "highIssues": counts["HIGH"],
        "mediumIssues": counts["MEDIUM"],
        "lowIssues": counts["LOW"],
        "informationalIssues": counts["INFO"],
        "optimizations": counts["OPT"],
        "keyFindings": key_findings or ["No critical or high-severity issues found"],
        "recommendation": rec,
    }


def run_security_audit(daml_code: str, contract_name: str = "Unknown") -> dict:
    """
    Run a comprehensive security audit on DAML code.

    Returns:
        dict with keys: success, audit_report, security_score, executive_summary, error
    """
    logger.info("Starting security audit", contract_name=contract_name)
    start_time = datetime.now(timezone.utc)

    try:
        user_message = (
            f"## DAML CONTRACT TO AUDIT\n\n"
            f"Contract Name: {contract_name}\n"
            f"Platform: Canton\n"
            f"Language: DAML\n\n"
            f"```daml\n{daml_code}\n```\n"
        )

        raw_response = call_llm(
            system_prompt=DAML_SECURITY_AUDIT_PROMPT,
            user_message=user_message,
            max_tokens=8192,
        )

        audit_report = _parse_json_response(raw_response)

        if not audit_report:
            # Retry with JSON enforcer
            logger.warning("First audit response not valid JSON, retrying...")
            enforcer = (
                "\n\nJSON OUTPUT ENFORCER: Output ONLY valid JSON matching the schema. "
                "No markdown fences, no explanatory text. Pure JSON only."
            )
            raw_response = call_llm(
                system_prompt=DAML_SECURITY_AUDIT_PROMPT,
                user_message=user_message + enforcer,
                max_tokens=8192,
            )
            audit_report = _parse_json_response(raw_response)

        if not audit_report:
            return {
                "success": False,
                "error": "Failed to parse audit response from LLM",
                "audit_report": {},
                "security_score": 0,
                "executive_summary": {},
            }

        # Normalize and validate the report
        findings = audit_report.get("findings", [])
        score = _compute_security_score(findings)
        exec_summary = _build_executive_summary(findings, score)

        # Override LLM's summary with our deterministic calculation
        audit_report["executiveSummary"] = exec_summary
        audit_report["contractName"] = contract_name
        audit_report["language"] = "DAML"
        audit_report["platform"] = "Canton"
        audit_report["auditDate"] = start_time.isoformat()
        audit_report["auditor"] = "Ginie Enterprise Audit Engine"
        audit_report["version"] = "2.0"

        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.info(
            "Security audit completed",
            contract_name=contract_name,
            score=score,
            findings=len(findings),
            elapsed_seconds=round(elapsed, 1),
        )

        return {
            "success": True,
            "audit_report": audit_report,
            "security_score": score,
            "executive_summary": exec_summary,
            "findings_count": len(findings),
            "error": None,
        }

    except Exception as e:
        logger.error("Security audit failed", error=str(e))
        return {
            "success": False,
            "error": str(e),
            "audit_report": {},
            "security_score": 0,
            "executive_summary": {},
        }
