"""
Ledger Explorer API — Browse contracts, templates, parties, and packages on Canton.

Provides endpoints for verifying deployed contracts and inspecting ledger state,
similar to Daml Navigator but native to the Ginie platform.
"""

import structlog
import httpx
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from config import get_settings
from canton.canton_client_v2 import make_sandbox_jwt

logger = structlog.get_logger()

ledger_router = APIRouter(prefix="/ledger", tags=["ledger-explorer"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _canton_url() -> str:
    return get_settings().get_canton_url()


def _canton_env() -> str:
    return get_settings().canton_environment


def _auth_header(act_as: list[str] | None = None) -> dict:
    """Build auth header for Canton JSON API."""
    import os
    env = _canton_env()
    if env == "sandbox":
        parties = act_as or ["Alice", "Bob", "Admin", "issuer", "owner", "investor"]
        token = make_sandbox_jwt(parties)
        return {"Authorization": f"Bearer {token}"}
    token = os.environ.get("CANTON_TOKEN", "")
    if not token:
        raise HTTPException(status_code=500, detail="CANTON_TOKEN not set for non-sandbox environment")
    return {"Authorization": f"Bearer {token}"}


def _json_api_request(method: str, path: str, body: dict | None = None, params: dict | None = None) -> dict:
    """Make a request to the Canton JSON API."""
    url = f"{_canton_url()}{path}"
    headers = {**_auth_header(), "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=15.0) as client:
            if method == "GET":
                resp = client.get(url, headers=headers, params=params)
            else:
                resp = client.post(url, headers=headers, json=body or {})
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=f"Canton JSON API not reachable at {_canton_url()}. Is it running?"
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Canton JSON API request timed out")

    if resp.status_code >= 400:
        detail = resp.text[:500]
        try:
            detail = resp.json().get("errors", [resp.text[:500]])
        except Exception:
            pass
        raise HTTPException(status_code=resp.status_code, detail=f"Canton API error: {detail}")

    return resp.json()


# ---------------------------------------------------------------------------
# 1. List Parties
# ---------------------------------------------------------------------------

@ledger_router.get("/parties")
def list_parties():
    """List all parties known to the ledger.

    Returns party identifiers, display names, and whether they are local.
    Similar to `daml ledger list-parties`.
    """
    data = _json_api_request("GET", "/v1/parties")
    result = data.get("result", [])

    parties = []
    for p in result:
        parties.append({
            "identifier": p.get("identifier", ""),
            "displayName": p.get("displayName", ""),
            "isLocal": p.get("isLocal", False),
        })

    return {
        "parties": parties,
        "count": len(parties),
        "ledger_url": _canton_url(),
        "environment": _canton_env(),
    }


# ---------------------------------------------------------------------------
# 2. List Contracts (query)
# ---------------------------------------------------------------------------

@ledger_router.post("/contracts")
def list_contracts(
    template_ids: list[str] | None = None,
    party: str | None = None,
):
    """Query active contracts on the ledger.

    Args:
        template_ids: Optional list of fully qualified template IDs to filter by.
        party: Optional party to act as for the query.

    Returns list of active contracts with their details.
    """
    act_as = [party] if party else None
    url = f"{_canton_url()}/v1/query"
    headers = {**_auth_header(act_as=act_as), "Content-Type": "application/json"}

    body = {}
    if template_ids:
        body["templateIds"] = template_ids

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(url, headers=headers, json=body)
    except httpx.ConnectError:
        raise HTTPException(status_code=503, detail="Canton JSON API not reachable")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request timed out")

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=f"Canton query error: {resp.text[:500]}")

    data = resp.json()
    result = data.get("result", [])

    contracts = []
    for c in result:
        contracts.append({
            "contractId": c.get("contractId", ""),
            "templateId": c.get("templateId", ""),
            "payload": c.get("payload", {}),
            "signatories": c.get("signatories", []),
            "observers": c.get("observers", []),
            "agreementText": c.get("agreementText", ""),
        })

    return {
        "contracts": contracts,
        "count": len(contracts),
        "environment": _canton_env(),
    }


# ---------------------------------------------------------------------------
# 3. Fetch Single Contract
# ---------------------------------------------------------------------------

@ledger_router.post("/contracts/fetch")
def fetch_contract(contract_id: str, template_id: str | None = None):
    """Fetch a specific contract by its ID.

    Args:
        contract_id: The contract ID to fetch.
        template_id: Optional template ID for faster lookup.
    """
    body = {"contractId": contract_id}
    if template_id:
        body["templateId"] = template_id

    data = _json_api_request("POST", "/v1/fetch", body=body)
    result = data.get("result", {})

    if not result:
        raise HTTPException(status_code=404, detail=f"Contract {contract_id} not found on ledger")

    return {
        "contract": {
            "contractId": result.get("contractId", contract_id),
            "templateId": result.get("templateId", ""),
            "payload": result.get("payload", {}),
            "signatories": result.get("signatories", []),
            "observers": result.get("observers", []),
            "agreementText": result.get("agreementText", ""),
        },
        "found": True,
        "environment": _canton_env(),
    }


# ---------------------------------------------------------------------------
# 4. List Packages (uploaded DARs)
# ---------------------------------------------------------------------------

@ledger_router.get("/packages")
def list_packages():
    """List all uploaded DAR packages on the ledger.

    Returns package IDs that have been uploaded to Canton.
    """
    data = _json_api_request("GET", "/v1/packages")
    result = data.get("result", [])

    return {
        "packages": result,
        "count": len(result),
        "environment": _canton_env(),
    }


# ---------------------------------------------------------------------------
# 5. Get Package Details
# ---------------------------------------------------------------------------

@ledger_router.get("/packages/{package_id}")
def get_package_detail(package_id: str):
    """Get details/status of a specific uploaded package."""
    try:
        data = _json_api_request("GET", f"/v1/packages/{package_id}")
        return {
            "package_id": package_id,
            "found": True,
            "details": data,
            "environment": _canton_env(),
        }
    except HTTPException as e:
        if e.status_code == 404:
            return {"package_id": package_id, "found": False, "environment": _canton_env()}
        raise


# ---------------------------------------------------------------------------
# 6. Allocate Party
# ---------------------------------------------------------------------------

@ledger_router.post("/parties/allocate")
def allocate_party(display_name: str, identifier_hint: str | None = None):
    """Allocate a new party on the ledger.

    Args:
        display_name: Human-readable name for the party.
        identifier_hint: Optional hint for the party identifier.
    """
    body = {"displayName": display_name}
    if identifier_hint:
        body["identifierHint"] = identifier_hint

    data = _json_api_request("POST", "/v1/parties/allocate", body=body)
    result = data.get("result", {})

    return {
        "identifier": result.get("identifier", ""),
        "displayName": result.get("displayName", display_name),
        "isLocal": result.get("isLocal", True),
        "environment": _canton_env(),
    }


# ---------------------------------------------------------------------------
# 7. Ledger Health / Status
# ---------------------------------------------------------------------------

@ledger_router.get("/status")
def ledger_status():
    """Check Canton ledger connectivity and basic stats."""
    canton_url = _canton_url()
    env = _canton_env()

    # Check reachability
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(
                f"{canton_url}/v1/query",
                content=b'{"templateIds":[]}',
                headers={**_auth_header(), "Content-Type": "application/json"},
            )
            reachable = resp.status_code < 500
    except Exception:
        reachable = False

    if not reachable:
        return {
            "status": "offline",
            "canton_url": canton_url,
            "environment": env,
            "error": "Canton JSON API is not reachable",
        }

    # Get party count
    try:
        party_data = _json_api_request("GET", "/v1/parties")
        party_count = len(party_data.get("result", []))
    except Exception:
        party_count = -1

    # Get package count
    try:
        pkg_data = _json_api_request("GET", "/v1/packages")
        package_count = len(pkg_data.get("result", []))
    except Exception:
        package_count = -1

    return {
        "status": "online",
        "canton_url": canton_url,
        "environment": env,
        "parties": party_count,
        "packages": package_count,
    }


# ---------------------------------------------------------------------------
# 8. Verify Contract (convenience — checks if contract exists on ledger)
# ---------------------------------------------------------------------------

@ledger_router.get("/verify/{contract_id}")
def verify_contract(contract_id: str):
    """Verify that a contract exists on the Canton ledger.

    Returns verification status and contract details if found.
    Useful for confirming successful deployments.
    """
    canton_url = _canton_url()
    headers = {**_auth_header(), "Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                f"{canton_url}/v1/fetch",
                headers=headers,
                json={"contractId": contract_id},
            )

        if resp.status_code >= 400:
            return {
                "verified": False,
                "contract_id": contract_id,
                "error": "Contract not found or not accessible",
                "environment": _canton_env(),
            }

        data = resp.json()
        result = data.get("result")

        if result:
            return {
                "verified": True,
                "contract_id": contract_id,
                "templateId": result.get("templateId", ""),
                "signatories": result.get("signatories", []),
                "observers": result.get("observers", []),
                "payload": result.get("payload", {}),
                "environment": _canton_env(),
            }
        else:
            return {
                "verified": False,
                "contract_id": contract_id,
                "error": "Contract not found on ledger",
                "environment": _canton_env(),
            }

    except Exception as e:
        return {
            "verified": False,
            "contract_id": contract_id,
            "error": str(e),
            "environment": _canton_env(),
        }
