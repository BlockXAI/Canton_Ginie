"""
Enterprise Compliance Engine for DAML Smart Contracts.

Supports multi-framework compliance analysis:
- NIST 800-53 Rev 5
- SOC 2 Type II
- ISO 27001:2022
- DeFi Security (Canton-adapted)
- Canton DLT Standards
"""

import json
import re
import structlog
from datetime import datetime, timezone

from security.audit_prompts import DAML_COMPLIANCE_PROMPT
from utils.llm_client import call_llm

logger = structlog.get_logger()

VALID_PROFILES = {
    "nist-800-53",
    "soc2-type2",
    "iso27001",
    "defi-security",
    "canton-dlt",
    "generic",
}


def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from LLM response."""
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
    logger.warning("Failed to parse LLM compliance response as JSON")
    return {}


def _compute_compliance_score(assessments: list) -> dict:
    """Compute compliance score from control assessments."""
    passed = 0
    failed = 0
    partial = 0
    na = 0
    critical_gaps = 0
    high_gaps = 0

    for ctrl in assessments:
        status = (ctrl.get("status") or "").upper()
        if status == "PASS":
            passed += 1
        elif status == "FAIL":
            failed += 1
            risk = (ctrl.get("risk") or "").upper()
            if risk == "CRITICAL":
                critical_gaps += 1
            elif risk == "HIGH":
                high_gaps += 1
        elif status == "PARTIAL":
            partial += 1
        elif status == "N/A":
            na += 1

    total_applicable = passed + failed + partial
    if total_applicable == 0:
        score = 100
    else:
        score = max(0, 100 - (failed * 15 + partial * 5))

    if score >= 95 and critical_gaps == 0:
        overall = "COMPLIANT"
        rec = "APPROVE"
    elif score >= 80 and high_gaps <= 2:
        overall = "MOSTLY_COMPLIANT"
        rec = "CONDITIONAL_APPROVE"
    elif score >= 60:
        overall = "PARTIALLY_COMPLIANT"
        rec = "NEEDS_REMEDIATION"
    else:
        overall = "NON_COMPLIANT"
        rec = "REJECT"

    if critical_gaps > 0:
        overall = "NON_COMPLIANT"
        rec = "REJECT"

    return {
        "overallCompliance": overall,
        "complianceScore": score,
        "controlsPassed": passed,
        "controlsFailed": failed,
        "controlsPartial": partial,
        "controlsNotApplicable": na,
        "criticalGaps": critical_gaps,
        "highGaps": high_gaps,
        "recommendation": rec,
    }


def run_compliance_analysis(
    daml_code: str,
    contract_name: str = "Unknown",
    profile: str = "generic",
) -> dict:
    """
    Run compliance analysis against a specific framework profile.

    Args:
        daml_code: The DAML source code to analyze
        contract_name: Name of the contract
        profile: Compliance profile (nist-800-53, soc2-type2, iso27001, defi-security, canton-dlt, generic)

    Returns:
        dict with keys: success, compliance_report, compliance_score, executive_summary, error
    """
    if profile not in VALID_PROFILES:
        profile = "generic"

    logger.info("Starting compliance analysis", contract_name=contract_name, profile=profile)
    start_time = datetime.now(timezone.utc)

    try:
        user_message = (
            f"## DAML CONTRACT TO ANALYZE\n\n"
            f"Contract Name: {contract_name}\n"
            f"Platform: Canton\n"
            f"Language: DAML\n"
            f"Compliance Profile: {profile}\n\n"
            f"```daml\n{daml_code}\n```\n\n"
            f"Analyze this contract against the **{profile}** compliance profile. "
            f"Provide a complete control-by-control assessment."
        )

        raw_response = call_llm(
            system_prompt=DAML_COMPLIANCE_PROMPT,
            user_message=user_message,
            max_tokens=8192,
        )

        compliance_report = _parse_json_response(raw_response)

        if not compliance_report:
            logger.warning("First compliance response not valid JSON, retrying...")
            enforcer = (
                "\n\nJSON OUTPUT ENFORCER: Output ONLY valid JSON matching the schema. "
                "No markdown fences, no explanatory text. Pure JSON only."
            )
            raw_response = call_llm(
                system_prompt=DAML_COMPLIANCE_PROMPT,
                user_message=user_message + enforcer,
                max_tokens=8192,
            )
            compliance_report = _parse_json_response(raw_response)

        if not compliance_report:
            return {
                "success": False,
                "error": "Failed to parse compliance response from LLM",
                "compliance_report": {},
                "compliance_score": 0,
                "executive_summary": {},
            }

        # Normalize and validate
        assessments = compliance_report.get("controlAssessments", [])
        exec_summary = _compute_compliance_score(assessments)

        compliance_report["executiveSummary"] = exec_summary
        compliance_report["complianceProfile"] = profile
        compliance_report["contractName"] = contract_name
        compliance_report["platform"] = "Canton"
        compliance_report["language"] = "DAML"
        compliance_report["analysisDate"] = start_time.isoformat()

        elapsed = (datetime.now(timezone.utc) - start_time).total_seconds()
        logger.info(
            "Compliance analysis completed",
            contract_name=contract_name,
            profile=profile,
            score=exec_summary["complianceScore"],
            elapsed_seconds=round(elapsed, 1),
        )

        return {
            "success": True,
            "compliance_report": compliance_report,
            "compliance_score": exec_summary["complianceScore"],
            "executive_summary": exec_summary,
            "profile": profile,
            "error": None,
        }

    except Exception as e:
        logger.error("Compliance analysis failed", error=str(e))
        return {
            "success": False,
            "error": str(e),
            "compliance_report": {},
            "compliance_score": 0,
            "executive_summary": {},
        }
