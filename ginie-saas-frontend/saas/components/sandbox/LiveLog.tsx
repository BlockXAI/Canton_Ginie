"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Check,
  AlertTriangle,
  XCircle,
  Info,
  Sparkles,
  Wrench,
  ShieldAlert,
  Rocket,
  Brain,
  Code2,
} from "lucide-react";
import type { LogEvent } from "@/lib/use-job-events";

interface LiveLogProps {
  events: LogEvent[];
  /**
   * If true (i.e. the job is still running), keep the feed scrolled to the
   * latest line as new events arrive — but only if the user has not scrolled
   * up to inspect older lines.
   */
  autoScroll: boolean;
}

function iconFor(event: LogEvent): React.ReactNode {
  const e = event.e;
  // Stage-scoped icons take precedence
  if (e.startsWith("stage_started:")) {
    const s = e.split(":")[1];
    if (s === "intent") return <Brain className="h-3.5 w-3.5 text-accent" />;
    if (s === "generate") return <Sparkles className="h-3.5 w-3.5 text-accent" />;
    if (s === "compile") return <Code2 className="h-3.5 w-3.5 text-accent" />;
    if (s === "audit") return <ShieldAlert className="h-3.5 w-3.5 text-accent" />;
    if (s === "deploy") return <Rocket className="h-3.5 w-3.5 text-accent" />;
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />;
  }
  if (e.startsWith("stage_completed:") || event.level === "success") {
    return <Check className="h-3.5 w-3.5 text-accent" strokeWidth={3} />;
  }
  if (e.startsWith("stage_failed:") || event.level === "error") {
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  }
  if (event.level === "warn") {
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  }
  if (e === "fix_started" || e === "fix_completed") {
    return <Wrench className="h-3.5 w-3.5 text-blue-500" />;
  }
  return <Info className="h-3.5 w-3.5 text-muted-foreground" />;
}

function levelColour(event: LogEvent): string {
  if (event.e.startsWith("stage_failed:") || event.level === "error") {
    return "text-red-500";
  }
  if (event.level === "warn") return "text-amber-500";
  if (event.level === "success" || event.e.startsWith("stage_completed:"))
    return "text-foreground";
  if (event.e.startsWith("stage_started:")) return "text-foreground";
  return "text-muted-foreground";
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

export function LiveLog({ events, autoScroll }: LiveLogProps): React.ReactNode {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  // Track whether the user is at the bottom; if they scroll up we stop
  // auto-following so they can read older lines without being yanked back.
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setStickToBottom(distance < 24);
  };

  useEffect(() => {
    if (!autoScroll || !stickToBottom) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events, autoScroll, stickToBottom]);

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
        Waiting for the pipeline to emit its first log line&hellip;
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="max-h-[420px] overflow-y-auto rounded-2xl border border-border bg-muted/40 font-mono text-[11px] leading-relaxed"
    >
      <ul className="divide-y divide-border/40">
        {events.map((evt, idx) => (
          <li
            key={`${evt.seq ?? idx}-${evt.e}`}
            className="grid grid-cols-[auto_auto_1fr] items-start gap-3 px-4 py-2 hover:bg-foreground/5"
          >
            <span className="pt-0.5 text-muted-foreground/50">
              {formatTime(evt.ts)}
            </span>
            <span className="pt-0.5">{iconFor(evt)}</span>
            <span className={`whitespace-pre-wrap break-words ${levelColour(evt)}`}>
              {evt.message || evt.e}
              {evt.data?.explorer_link ? (
                <>
                  {" "}
                  <a
                    href={String(evt.data.explorer_link)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline-offset-2 hover:underline"
                  >
                    open in explorer &rarr;
                  </a>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
