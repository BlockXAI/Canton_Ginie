import os
import uuid
import hashlib
import structlog
import httpx
from typing import Optional

from config import get_settings

logger = structlog.get_logger()

_CANTON_NOT_RUNNING = """
Canton node is not reachable at {url}.

To start Canton Sandbox locally:
    daml sandbox

It starts on http://localhost:6865 by default.
For DevNet/MainNet set CANTON_ENVIRONMENT and the matching URL in backend/.env.
""".strip()


def _auth_header(canton_environment: str) -> dict:
    if canton_environment == "sandbox":
        return {"Authorization": "Bearer sandbox-token"}
    token = os.environ.get("CANTON_TOKEN", "")
    if not token:
        raise EnvironmentError(
            "CANTON_TOKEN env var is required for devnet/mainnet deployments. "
            "Set it in backend/.env as CANTON_TOKEN=<your-token>"
        )
    return {"Authorization": f"Bearer {token}"}


def _check_canton_reachable(canton_url: str, canton_environment: str) -> None:
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(
                f"{canton_url}/v1/query",
                content=b'{"templateIds":[]}',
                headers={**_auth_header(canton_environment), "Content-Type": "application/json"},
            )
            if resp.status_code >= 500:
                raise ConnectionError(
                    f"Canton node returned {resp.status_code}. "
                    f"Node may be starting up — wait a moment and retry."
                )
    except (httpx.ConnectError, httpx.ConnectTimeout):
        raise ConnectionError(_CANTON_NOT_RUNNING.format(url=canton_url))


def _upload_dar(client: httpx.Client, canton_url: str, dar_bytes: bytes, auth: dict) -> str:
    resp = client.post(
        f"{canton_url}/v1/packages",
        content=dar_bytes,
        headers={**auth, "Content-Type": "application/octet-stream"},
        timeout=60.0,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"DAR upload failed — HTTP {resp.status_code}: {resp.text[:400]}"
        )
    data = resp.json()
    package_id = (
        data.get("result")
        or data.get("packageId")
        or _compute_package_id(dar_bytes)
    )
    if isinstance(package_id, dict):
        package_id = package_id.get("packageId", _compute_package_id(dar_bytes))
    return str(package_id)


def _allocate_party(client: httpx.Client, canton_url: str, display_name: str, auth: dict) -> str:
    resp = client.post(
        f"{canton_url}/v1/parties/allocate",
        json={"displayName": display_name, "identifierHint": display_name.lower()},
        headers={**auth, "Content-Type": "application/json"},
        timeout=15.0,
    )
    if resp.status_code in (200, 201):
        data = resp.json()
        return (
            data.get("result", {}).get("identifier")
            or data.get("identifier")
            or f"{display_name}::canton-{uuid.uuid4().hex[:8]}"
        )
    logger.warning("Party allocation returned non-2xx", status=resp.status_code, body=resp.text[:200])
    return f"{display_name}::canton-{uuid.uuid4().hex[:8]}"


def _create_contract(
    client: httpx.Client,
    canton_url: str,
    template_id: str,
    payload: dict,
    auth: dict,
) -> str:
    resp = client.post(
        f"{canton_url}/v1/create",
        json={"templateId": template_id, "payload": payload},
        headers={**auth, "Content-Type": "application/json"},
        timeout=30.0,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(
            f"Contract creation failed — HTTP {resp.status_code}: {resp.text[:400]}"
        )
    data = resp.json()
    contract_id = (
        data.get("result", {}).get("contractId")
        or data.get("contractId")
    )
    if not contract_id:
        raise RuntimeError(f"No contractId in Canton response: {resp.text[:300]}")
    return contract_id


def run_deploy_agent(
    dar_path: str,
    structured_intent: dict,
    canton_url: str,
    canton_environment: str,
) -> dict:
    if not dar_path or not os.path.exists(dar_path):
        return {
            "success": False,
            "error":   f"DAR file not found: {dar_path}",
            "contract_id":   "",
            "package_id":    "",
            "explorer_link": "",
        }

    logger.info("Running deploy agent", dar_path=dar_path, environment=canton_environment, url=canton_url)

    try:
        _check_canton_reachable(canton_url, canton_environment)
    except (ConnectionError, EnvironmentError) as exc:
        logger.error("Canton not reachable", error=str(exc))
        return {
            "success": False,
            "error":   str(exc),
            "contract_id":   "",
            "package_id":    "",
            "explorer_link": "",
        }

    try:
        with open(dar_path, "rb") as f:
            dar_bytes = f.read()

        auth = _auth_header(canton_environment)

        with httpx.Client() as client:
            package_id = _upload_dar(client, canton_url, dar_bytes, auth)
            logger.info("DAR uploaded", package_id=package_id)

            parties = structured_intent.get("parties", ["owner", "counterparty"])
            templates = structured_intent.get("daml_templates_needed", ["Main"])
            primary_template = templates[0] if templates else "Main"

            allocated = {}
            for party_name in parties[:4]:
                allocated[party_name] = _allocate_party(client, canton_url, party_name, auth)
                logger.info("Party allocated", name=party_name, id=allocated[party_name])

            payload = dict(allocated)

            contract_id = _create_contract(
                client,
                canton_url,
                f"Main:{primary_template}",
                payload,
                auth,
            )
            logger.info("Contract created", contract_id=contract_id)

        if canton_environment == "sandbox":
            explorer_link = f"http://localhost:7575/contract/{contract_id}"
        elif canton_environment == "devnet":
            explorer_link = f"https://canton.network/explorer/contract/{contract_id}"
        else:
            explorer_link = f"https://main.canton.network/explorer/contract/{contract_id}"

        return {
            "success":       True,
            "contract_id":   contract_id,
            "package_id":    package_id,
            "explorer_link": explorer_link,
            "environment":   canton_environment,
            "parties":       allocated,
        }

    except RuntimeError as exc:
        logger.error("Deploy failed", error=str(exc))
        return {
            "success": False,
            "error":   str(exc),
            "contract_id":   "",
            "package_id":    "",
            "explorer_link": "",
        }
    except Exception as exc:
        logger.error("Unexpected deploy error", error=str(exc))
        return {
            "success": False,
            "error":   f"Unexpected error: {exc}",
            "contract_id":   "",
            "package_id":    "",
            "explorer_link": "",
        }


def _compute_package_id(dar_bytes: bytes) -> str:
    return hashlib.sha256(dar_bytes).hexdigest()[:40]
