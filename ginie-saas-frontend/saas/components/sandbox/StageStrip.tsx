"use client";

import {
  Sparkles,
  Code2,
  ShieldCheck,
  Rocket,
  CheckCheck,
  Brain,
  Loader2,
  Check,
  X,
  Circle,
} from "lucide-react";
import type { StageKey, StageStatus } from "@/lib/use-job-events";
import { PIPELINE_STAGES } from "@/lib/use-job-events";

const STAGE_LABEL: Record<StageKey, string> = {
  intent: "Plan",
  generate: "Generate",
  compile: "Compile",
  audit: "Audit",
  deploy: "Deploy",
  verify: "Verify",
};

const STAGE_ICON: Record<StageKey, React.ComponentType<{ className?: string }>> = {
  intent: Brain,
  generate: Sparkles,
  compile: Code2,
  audit: ShieldCheck,
  deploy: Rocket,
  verify: CheckCheck,
};

function StageDot({
  status,
}: {
  status: StageStatus;
}): React.ReactNode {
  if (status === "completed") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-black shadow-[0_0_12px_rgba(34,197,94,0.45)]">
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-accent text-accent">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.5)]">
        <X className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-border text-muted-foreground/60">
      <Circle className="h-2 w-2" fill="currentColor" />
    </span>
  );
}

export function StageStrip({
  stages,
}: {
  stages: Record<StageKey, StageStatus>;
}): React.ReactNode {
  // Connector colour between two adjacent stages: green only if the LEFT
  // one is fully completed; otherwise muted.
  const connectorColour = (left: StageStatus): string =>
    left === "completed" ? "bg-accent/60" : "bg-border";

  return (
    <div className="flex w-full items-center gap-1">
      {PIPELINE_STAGES.map((stage, i) => {
        const status = stages[stage];
        const Icon = STAGE_ICON[stage];
        const labelColour =
          status === "completed"
            ? "text-accent"
            : status === "running"
              ? "text-foreground"
              : status === "failed"
                ? "text-red-500"
                : "text-muted-foreground/70";

        return (
          <div key={stage} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <StageDot status={status} />
              <div className="flex flex-col items-center gap-0.5">
                <Icon className={`h-3 w-3 ${labelColour}`} />
                <span
                  className={`text-[10px] font-medium uppercase tracking-wider ${labelColour}`}
                >
                  {STAGE_LABEL[stage]}
                </span>
              </div>
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 rounded-full transition-colors duration-300 ${connectorColour(status)}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
