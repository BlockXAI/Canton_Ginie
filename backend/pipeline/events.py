"""Structured event emission for the agentic pipeline.

Pipeline nodes emit short, user-facing log lines through ``emit()``. Each
event is:
  1. Persisted to the ``job_events`` table so it can be replayed on reload.
  2. Pushed to any connected WebSocket clients in the same envelope used by
     the frontend live-log feed.

This sits *alongside* the legacy ``status_callback`` in
``pipeline.orchestrator`` — that callback still drives the coarse
``current_step`` / ``progress`` snapshot used by the polling fallback.
``emit()`` adds the fine-grained, append-only timeline.
"""

from __future__ import annotations

import threading
import structlog
from datetime import datetime, timezone
from typing import Any, Optional

logger = structlog.get_logger()

# In-memory monotonic counter per job for ordering events even when DB writes
# are batched/lossy. The DB ``seq`` column is the canonical order.
_seq_lock = threading.Lock()
_seq_by_job: dict[str, int] = {}


def _next_seq(job_id: str) -> int:
    with _seq_lock:
        n = _seq_by_job.get(job_id, 0) + 1
        _seq_by_job[job_id] = n
        return n


# Canonical pipeline stages, in execution order. The frontend renders these
# as a horizontal strip with status pills (pending / running / completed /
# failed). Keep names lowercase + stable — they appear in event_type strings.
PIPELINE_STAGES: tuple[str, ...] = (
    "intent",
    "spec",
    "generate",
    "compile",
    "audit",
    "deploy",
    "verify",
)


def _persist(job_id: str, seq: int, event_type: str, level: str, message: str, data: Optional[dict]) -> None:
    """Insert one row into ``job_events``. Best-effort — never raises."""
    try:
        from db.session import get_db_session
        from db.models import JobEvent
        with get_db_session() as session:
            row = JobEvent(
                job_id=job_id,
                seq=seq,
                event_type=event_type,
                level=level,
                message=message or "",
                data=data,
            )
            session.add(row)
    except Exception as e:
        logger.debug("JobEvent persist failed", job_id=job_id, error=str(e))


def _push_ws(job_id: str, payload: dict) -> None:
    """Push the event onto the WebSocket fan-out (best-effort)."""
    try:
        from api.ws_routes import push_status_sync
        push_status_sync(job_id, payload)
    except Exception as e:
        logger.debug("JobEvent WS push failed", job_id=job_id, error=str(e))


def emit(
    state: dict,
    event_type: str,
    message: str = "",
    *,
    level: str = "info",
    data: Optional[dict[str, Any]] = None,
) -> None:
    """Emit one structured pipeline event.

    Args:
        state:       Pipeline state dict (must contain ``job_id``).
        event_type:  Short identifier, e.g. ``"stage_started:compile"`` or
                     ``"deploy_success"``. Convention: ``snake_case`` with an
                     optional ``:stage`` suffix when stage-scoped.
        message:     Human-readable line shown in the log feed.
        level:       Visual severity. One of ``info``, ``success``, ``warn``,
                     ``error``, ``debug``.
        data:        Optional JSON-serialisable payload (e.g. contract_id,
                     explorer_link, finding details). Made available to the
                     frontend without polluting the message string.
    """
    job_id = state.get("job_id") if isinstance(state, dict) else None
    if not job_id:
        return

    seq = _next_seq(job_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Persist first so a reload always shows a complete timeline even if the
    # WS push race-loses to a disconnect.
    _persist(job_id, seq, event_type, level, message, data)

    payload: dict[str, Any] = {
        "type": "event",
        "e": event_type,
        "seq": seq,
        "level": level,
        "message": message,
        "ts": now_iso,
    }
    if data:
        payload["data"] = data
    _push_ws(job_id, payload)


def emit_stage_started(state: dict, stage: str, message: str = "", **data: Any) -> None:
    """Convenience wrapper: mark a pipeline stage as started."""
    emit(
        state,
        f"stage_started:{stage}",
        message or f"Stage: {stage}",
        level="info",
        data={"stage": stage, **data} if data else {"stage": stage},
    )


def emit_stage_completed(state: dict, stage: str, message: str = "", **data: Any) -> None:
    """Convenience wrapper: mark a pipeline stage as successfully completed."""
    emit(
        state,
        f"stage_completed:{stage}",
        message or f"{stage} complete",
        level="success",
        data={"stage": stage, **data} if data else {"stage": stage},
    )


def emit_stage_failed(state: dict, stage: str, message: str = "", **data: Any) -> None:
    """Convenience wrapper: mark a pipeline stage as failed."""
    emit(
        state,
        f"stage_failed:{stage}",
        message or f"{stage} failed",
        level="error",
        data={"stage": stage, **data} if data else {"stage": stage},
    )


def emit_log(state: dict, message: str, *, level: str = "info", **data: Any) -> None:
    """Plain log line (no stage transition)."""
    emit(state, "log", message, level=level, data=data or None)
