import re
import os
import shutil
import structlog
from pathlib import Path

logger = structlog.get_logger()


def ensure_dir(path: str) -> str:
    Path(path).mkdir(parents=True, exist_ok=True)
    return path


def cleanup_job_dir(job_id: str, base_dir: str) -> None:
    job_dir = os.path.join(base_dir, f"ginie-{job_id}")
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir, ignore_errors=True)
        logger.info("Cleaned up job directory", job_id=job_id)


def validate_daml_syntax_quick(code: str) -> list[str]:
    issues = []

    if not re.search(r"^module\s+\w+\s+where", code, re.MULTILINE):
        issues.append("Missing module declaration (e.g., `module Main where`)")

    if not re.search(r"^template\s+\w+", code, re.MULTILINE):
        issues.append("No template defined")

    if "template " in code and "signatory" not in code:
        issues.append("Template missing `signatory` declaration")

    if "choice " in code and "controller" not in code:
        issues.append("Choice missing `controller` declaration")

    tabs_used = "\t" in code
    if tabs_used:
        issues.append("Tabs detected — Daml requires spaces for indentation")

    return issues


def extract_template_names(code: str) -> list[str]:
    return re.findall(r"^template\s+(\w+)", code, re.MULTILINE)


def extract_choice_names(code: str) -> list[str]:
    return re.findall(r"^\s+choice\s+(\w+)", code, re.MULTILINE)


def extract_party_fields(code: str) -> list[str]:
    return re.findall(r"^\s+(\w+)\s*:\s*Party", code, re.MULTILINE)


def format_daml_code_summary(code: str) -> dict:
    templates = extract_template_names(code)
    choices   = extract_choice_names(code)
    parties   = list(set(extract_party_fields(code)))

    module_match = re.search(r"^module\s+(\w+)\s+where", code, re.MULTILINE)
    module_name  = module_match.group(1) if module_match else "Unknown"

    return {
        "module":    module_name,
        "templates": templates,
        "choices":   choices,
        "parties":   parties,
        "lines":     len(code.split("\n")),
    }


def get_daml_sdk_version(_daml_sdk_path: str = "") -> str:
    import subprocess
    from agents.compile_agent import resolve_daml_sdk
    try:
        sdk = resolve_daml_sdk()
        result = subprocess.run([sdk, "version"], capture_output=True, text=True, timeout=10)
        first_line = result.stdout.strip().split("\n")[0]
        return first_line or f"daml {sdk}"
    except FileNotFoundError:
        return "SDK not installed — run: curl -sSL https://get.daml.com/ | sh"
    except Exception as exc:
        return f"SDK error: {exc}"
