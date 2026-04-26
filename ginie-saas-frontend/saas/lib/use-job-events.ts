"use client";

/**
 * Live deployment-log hook.
 *
 * Wraps the same `/ws/status/{job_id}` socket already used by `useJobStatus`
 * but accumulates the structured `event` messages emitted by the backend
 * pipeline (see `backend/pipeline/events.py`). The hook also computes
 * per-stage status (`pending` | `running` | `completed` | `failed`) so the
 * UI can render the stage-strip pills.
 *
 * The socket protocol is:
 *   - First frame:  the legacy job-status snapshot (existing behaviour).
 *   - Second frame: `{ type: "history", events: [...] }` — every persisted
 *                   event for this job in order. Empty for fresh jobs.
 *   - Live frames:  `{ type: "event", e, seq, level, message, ts, data? }`
 *                   one per emit() call on the backend.
 *   - Heartbeats:   `{ type: "heartbeat" }` — ignored.
 *
 * History is also fetched eagerly via the polling fallback (HTTP GET) so
 * the log appears even if the WS handshake fails.
 */

import { useEffect, useRef, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const PIPELINE_STAGES = [
  "intent",
  "generate",
  "compile",
  "audit",
  "deploy",
  "verify",
] as const;

export type StageKey = (typeof PIPELINE_STAGES)[number];

export type StageStatus = "pending" | "running" | "completed" | "failed";

export interface LogEvent {
  e: string;
  seq: number;
  level: "info" | "success" | "warn" | "error" | "debug";
  message: string;
  ts?: string;
  data?: Record<string, unknown> | null;
}

export interface JobEventsState {
  events: LogEvent[];
  stages: Record<StageKey, StageStatus>;
  transport: "websocket" | "polling" | "connecting";
  connected: boolean;
}

const initialStages = (): Record<StageKey, StageStatus> =>
  PIPELINE_STAGES.reduce(
    (acc, s) => {
      acc[s] = "pending";
      return acc;
    },
    {} as Record<StageKey, StageStatus>,
  );

function applyEventToStages(
  stages: Record<StageKey, StageStatus>,
  e: LogEvent,
): Record<StageKey, StageStatus> {
  const t = e.e || "";
  const colonIdx = t.indexOf(":");
  if (colonIdx === -1) return stages;
  const action = t.slice(0, colonIdx);
  const stage = t.slice(colonIdx + 1) as StageKey;
  if (!PIPELINE_STAGES.includes(stage)) return stages;
  if (action === "stage_started") {
    return { ...stages, [stage]: "running" };
  }
  if (action === "stage_completed") {
    return { ...stages, [stage]: "completed" };
  }
  if (action === "stage_failed") {
    return { ...stages, [stage]: "failed" };
  }
  return stages;
}

function getWsUrl(jobId: string): string {
  const base = API_URL.replace(/\/api\/v1\/?$/, "");
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/ws/status/${jobId}`;
}

export function useJobEvents(jobId: string | null): JobEventsState {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [stages, setStages] = useState<Record<StageKey, StageStatus>>(
    initialStages,
  );
  const [transport, setTransport] =
    useState<JobEventsState["transport"]>("connecting");
  const [connected, setConnected] = useState(false);

  // Track seen sequence numbers to deduplicate when history replay overlaps
  // with a few in-flight live messages.
  const seenSeqRef = useRef<Set<number>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  const ingestEvents = (incoming: LogEvent[]) => {
    if (!incoming.length) return;
    const fresh = incoming.filter((e) => {
      if (typeof e.seq !== "number") return true;
      if (seenSeqRef.current.has(e.seq)) return false;
      seenSeqRef.current.add(e.seq);
      return true;
    });
    if (!fresh.length) return;
    setEvents((prev) => {
      const merged = [...prev, ...fresh];
      // Keep events sorted by seq so out-of-order WS arrivals still render
      // chronologically. seq is monotonic per job on the backend.
      merged.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
      return merged;
    });
    setStages((prev) => fresh.reduce(applyEventToStages, prev));
  };

  // Eager HTTP fallback so the log shows up even before the WS opens.
  const fetchHistory = async (id: string) => {
    try {
      const r = await fetch(`${API_URL}/jobs/${id}/events`);
      if (!r.ok) return;
      const d = (await r.json()) as { events?: LogEvent[] };
      if (d.events?.length) ingestEvents(d.events);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    seenSeqRef.current = new Set();
    setEvents([]);
    setStages(initialStages());
    setTransport("connecting");
    setConnected(false);

    if (!jobId) return () => undefined;

    void fetchHistory(jobId);

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(getWsUrl(jobId));
    } catch {
      setTransport("polling");
      return () => undefined;
    }

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      setTransport("websocket");
      setConnected(true);
    };

    ws.onmessage = (evt) => {
      if (!isMountedRef.current) return;
      const text = evt.data;
      if (text === "pong") return;
      try {
        const data = JSON.parse(text);
        if (data.type === "heartbeat") return;
        if (data.type === "history" && Array.isArray(data.events)) {
          ingestEvents(data.events as LogEvent[]);
          return;
        }
        if (data.type === "event") {
          ingestEvents([data as LogEvent]);
          return;
        }
        // Anything else is the legacy job-status snapshot — ignore here,
        // useJobStatus already handles it.
      } catch {
        /* ignore malformed messages */
      }
    };

    ws.onerror = () => {
      /* will surface via onclose */
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      setConnected(false);
      // Fall back to one-shot HTTP refresh so the user still gets *something*
      // if the socket dies mid-pipeline.
      setTransport("polling");
      void fetchHistory(jobId);
    };

    wsRef.current = ws;

    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        try {
          wsRef.current.onmessage = null;
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          if (wsRef.current.readyState <= WebSocket.OPEN) {
            wsRef.current.close();
          }
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return { events, stages, transport, connected };
}
