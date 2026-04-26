"use client";

/**
 * SpecPanel — renders the structured contract Plan synthesised by the
 * backend's spec_synth stage.
 *
 * The panel is collapsible, lives above the StageStrip on /sandbox/[jobId],
 * and shows the model's reasoning *before* the code is written:
 *
 *   - Title / pattern / domain
 *   - Plain-English rationale
 *   - Parties (with signatory / observer flags)
 *   - Fields the contract must contain
 *   - Behaviours (choices the contract must expose)
 *   - Non-behaviours (choices that must NOT exist) — this is the
 *     differentiator vs. ginie-fb: we make the model commit to what the
 *     contract is intentionally *omitting*.
 *   - Invariants
 *   - Test scenarios
 *
 * If the spec was not produced (LLM failure / no plan synthesised), the
 * caller should not render this component at all.
 */

import { useState } from "react";
import {
  ClipboardList,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Beaker,
  Tag,
  Users,
  ListChecks,
  Layers,
} from "lucide-react";
import type { ContractSpec } from "@/lib/use-job-events";

interface Props {
  spec: ContractSpec;
  defaultOpen?: boolean;
}

function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
}): React.ReactNode {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-accent" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {typeof count === "number" && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
          {count}
        </span>
      )}
    </div>
  );
}

export function SpecPanel({ spec, defaultOpen = true }: Props): React.ReactNode {
  const [open, setOpen] = useState(defaultOpen);

  const parties = spec.parties ?? [];
  const fields = spec.fields ?? [];
  const behaviours = spec.behaviours ?? [];
  const nonBehaviours = spec.non_behaviours ?? [];
  const invariants = spec.invariants ?? [];
  const tests = spec.test_scenarios ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-accent/20 bg-accent/5">
      {/* Header / collapse toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-accent/10"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20">
            <ClipboardList className="h-4 w-4 text-accent" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {spec.title || "Contract Plan"}
              </h3>
              {spec.pattern && (
                <span className="hidden sm:inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent">
                  {spec.pattern}
                </span>
              )}
            </div>
            {spec.summary && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {spec.summary}
              </p>
            )}
          </div>
        </div>
        <span className="shrink-0 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-accent/15 px-5 py-5">
          {/* Domain / pattern badges (mobile-friendly) */}
          <div className="flex flex-wrap items-center gap-2 sm:hidden">
            {spec.pattern && (
              <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-accent">
                {spec.pattern}
              </span>
            )}
            {spec.domain && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <Tag className="h-2.5 w-2.5" />
                {spec.domain}
              </span>
            )}
          </div>

          {/* Rationale */}
          {spec.rationale && (
            <div>
              <SectionHeader icon={Layers} label="Rationale" />
              <p className="text-sm leading-relaxed text-foreground/80">
                {spec.rationale}
              </p>
            </div>
          )}

          {/* Parties */}
          {parties.length > 0 && (
            <div>
              <SectionHeader icon={Users} label="Parties" count={parties.length} />
              <ul className="space-y-1.5">
                {parties.map((p, i) => (
                  <li
                    key={`${p.name ?? "party"}-${i}`}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
                  >
                    <span className="font-mono font-medium text-foreground">
                      {p.name ?? "—"}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {p.is_signatory && (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">
                          signatory
                        </span>
                      )}
                      {p.is_observer && (
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-blue-600 dark:text-blue-400">
                          observer
                        </span>
                      )}
                    </span>
                    {p.role && (
                      <span className="text-xs text-muted-foreground">— {p.role}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Fields */}
          {fields.length > 0 && (
            <div>
              <SectionHeader icon={ListChecks} label="Fields" count={fields.length} />
              <ul className="space-y-1.5">
                {fields.map((f, i) => (
                  <li
                    key={`${f.name ?? "field"}-${i}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-sm"
                  >
                    <span className="font-mono font-medium text-foreground">
                      {f.name ?? "?"}
                    </span>
                    <span className="font-mono text-xs text-accent/80">
                      : {f.type ?? "Text"}
                    </span>
                    {f.required === false && (
                      <span className="rounded bg-muted px-1 py-0.5 text-[9px] uppercase text-muted-foreground">
                        optional
                      </span>
                    )}
                    {f.purpose && (
                      <span className="text-xs text-muted-foreground">— {f.purpose}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Behaviours */}
          {behaviours.length > 0 && (
            <div>
              <SectionHeader icon={CheckCircle2} label="Behaviours" count={behaviours.length} />
              <ul className="space-y-2">
                {behaviours.map((b, i) => (
                  <li
                    key={`${b.name ?? "behaviour"}-${i}`}
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono font-medium text-foreground">
                        {b.name ?? "?"}
                      </span>
                      {b.controller && (
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-mono text-accent">
                          ctrl: {b.controller}
                        </span>
                      )}
                      {b.effect && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
                          {b.effect}
                        </span>
                      )}
                    </div>
                    {b.description && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {b.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Non-behaviours — the value-add over ginie-fb */}
          {nonBehaviours.length > 0 && (
            <div>
              <SectionHeader
                icon={XCircle}
                label="Non-behaviours (intentionally absent)"
                count={nonBehaviours.length}
              />
              <ul className="space-y-2">
                {nonBehaviours.map((nb, i) => (
                  <li
                    key={`${nb.name ?? "nb"}-${i}`}
                    className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-mono font-medium text-red-600 dark:text-red-400 line-through decoration-red-500/40">
                        {nb.name ?? "?"}
                      </span>
                    </div>
                    {nb.reason && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {nb.reason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Invariants */}
          {invariants.length > 0 && (
            <div>
              <SectionHeader icon={ShieldCheck} label="Invariants" count={invariants.length} />
              <ul className="space-y-1">
                {invariants.map((inv, i) => (
                  <li
                    key={`inv-${i}`}
                    className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-1.5"
                  >
                    <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <code className="text-xs leading-relaxed text-foreground/80">
                      {inv}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Test scenarios */}
          {tests.length > 0 && (
            <div>
              <SectionHeader icon={Beaker} label="Test scenarios" count={tests.length} />
              <ol className="space-y-1">
                {tests.map((t, i) => (
                  <li
                    key={`test-${i}`}
                    className="flex items-start gap-2 text-sm leading-relaxed text-foreground/80"
                  >
                    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-mono text-muted-foreground">
                      {i + 1}
                    </span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
