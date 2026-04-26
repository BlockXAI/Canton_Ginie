"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Search,
  History as HistoryIcon,
  ExternalLink,
  Download,
  Trash2,
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  FileText,
  Filter,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface JobItem {
  job_id: string;
  prompt: string;
  status: "queued" | "running" | "complete" | "failed" | string;
  current_step: string | null;
  progress: number | null;
  error_message: string | null;
  canton_env: string;
  created_at: string | null;
  updated_at: string | null;
  contract_id: string | null;
  template_id: string | null;
  explorer_link: string | null;
  deploy_gate: boolean | null;
  security_score: number | null;
  compliance_score: number | null;
  fallback_used: boolean | null;
  has_dar: boolean;
}

type StatusFilter = "all" | "complete" | "running" | "failed";

function StatusPill({ status }: { status: string }): React.ReactNode {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
        <CheckCircle2 className="h-3 w-3" />
        completed
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">
        <XCircle className="h-3 w-3" />
        failed
      </span>
    );
  }
  if (status === "running" || status === "queued") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
      {status}
    </span>
  );
}

function NetworkPill({ env }: { env: string }): React.ReactNode {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-purple-500">
      canton-{env || "sandbox"}
    </span>
  );
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function JobCard({
  job,
  onDelete,
}: {
  job: JobItem;
  onDelete: (job_id: string) => Promise<void>;
}): React.ReactNode {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    if (!confirm("Delete this job from your history? Canton ledger state will not be affected.")) return;
    setDeleting(true);
    try {
      await onDelete(job.job_id);
    } finally {
      setDeleting(false);
    }
  };

  const tplName = (job.template_id || "").split(":").pop() || "Daml contract";
  const verified = job.status === "complete" && !!job.contract_id;

  return (
    <div className="rounded-2xl border border-border bg-frame p-5 transition-colors hover:border-accent/30">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">
              {tplName}
            </h3>
            <StatusPill status={job.status} />
            <NetworkPill env={job.canton_env} />
            {job.fallback_used && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                fallback used
              </span>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {job.prompt || job.current_step || "(no prompt recorded)"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground/80">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtDateTime(job.created_at)}
            </span>
            <span className="font-mono">job {job.job_id.slice(0, 8)}\u2026</span>
            {job.template_id && (
              <span className="inline-flex items-center gap-1 font-mono">
                <FileText className="h-3 w-3" />
                {job.template_id.split(":").pop()}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/sandbox/${job.job_id}`}
            title="Open run / replay log"
            className="rounded-md border border-border bg-foreground/5 p-1.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          {job.has_dar && (
            <a
              href={`${API_URL}/download/${job.job_id}/dar`}
              title="Download DAR"
              className="rounded-md border border-accent/30 bg-accent/10 p-1.5 text-accent hover:bg-accent/20"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            title="Delete from history"
            className="rounded-md border border-border bg-foreground/5 p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Mini stats grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border/60 bg-foreground/[0.02] p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Status</p>
          <p className="mt-0.5 text-xs font-medium text-foreground">
            {job.status === "complete" ? "Completed" : job.status === "failed" ? "Failed" : job.current_step || "\u2014"}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-foreground/[0.02] p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Progress</p>
          <p className="mt-0.5 font-mono text-xs text-foreground">
            {job.progress != null ? `${job.progress}%` : "N/A"}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-foreground/[0.02] p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Security</p>
          <p className="mt-0.5 font-mono text-xs text-foreground">
            {job.security_score != null ? `${job.security_score}/100` : "\u2014"}
          </p>
        </div>
        <div className="rounded-lg border border-border/60 bg-foreground/[0.02] p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Verified</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-foreground">
            {verified ? (
              <>
                <Shield className="h-3 w-3 text-accent" />
                Yes
              </>
            ) : (
              "No"
            )}
          </p>
        </div>
      </div>

      {/* Prompt body */}
      {job.prompt && (
        <div className="mt-4 rounded-lg border border-border/60 bg-foreground/[0.02] p-3">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/70">Prompt</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
            {job.prompt}
          </p>
        </div>
      )}

      {/* Footer: timestamps */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground/70">
        <span>Created: {fmtDateTime(job.created_at)}</span>
        <span>Updated: {fmtDateTime(job.updated_at)}</span>
        {job.explorer_link && (
          <a
            href={job.explorer_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            ledger explorer
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const { isAuthenticated, token, hydrated } = useAuth();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [networkFilter, setNetworkFilter] = useState<string>("all");

  const fetchJobs = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_URL}/me/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { jobs?: JobItem[] };
      setJobs(d.jobs || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    void fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, isAuthenticated, token]);

  const handleDelete = async (job_id: string) => {
    if (!token) return;
    try {
      const r = await fetch(`${API_URL}/me/jobs/${job_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setJobs((prev) => prev.filter((j) => j.job_id !== job_id));
    } catch (e) {
      alert(`Failed to delete: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  const networks = useMemo(() => {
    const s = new Set<string>();
    for (const j of jobs) if (j.canton_env) s.add(j.canton_env);
    return ["all", ...Array.from(s)];
  }, [jobs]);

  const visible = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (networkFilter !== "all" && j.canton_env !== networkFilter) return false;
      if (!q) return true;
      return (
        (j.prompt || "").toLowerCase().includes(q) ||
        (j.template_id || "").toLowerCase().includes(q) ||
        (j.contract_id || "").toLowerCase().includes(q) ||
        j.job_id.toLowerCase().includes(q)
      );
    });
  }, [jobs, searchTerm, statusFilter, networkFilter]);

  // Auth gate
  if (hydrated && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background pt-32 pb-20">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-2xl border border-border bg-frame p-8 text-center shadow-lg">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
              <Lock className="h-7 w-7 text-accent" />
            </div>
            <h1 className="mt-5 text-2xl font-semibold text-foreground">Sign in required</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in to see every contract you have ever generated and deployed.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-accent/30 hover:bg-accent/90 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-background pt-32 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 pt-28 pb-12 max-[850px]:pt-24">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <HistoryIcon className="h-5 w-5 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">History</h1>
              <p className="text-xs text-muted-foreground">
                Every contract generation and deployment you have ever started.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1">
              {jobs.length} total
            </span>
          </div>
        </div>

        {/* Filter row */}
        <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-border bg-frame p-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <input
              type="text"
              placeholder="Search title, contract id, prompt..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-accent/50 focus:outline-none"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent/50 focus:outline-none"
          >
            <option value="all">All states</option>
            <option value="complete">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={networkFilter}
            onChange={(e) => setNetworkFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-accent/50 focus:outline-none"
          >
            {networks.map((n) => (
              <option key={n} value={n}>
                {n === "all" ? "All networks" : `canton-${n}`}
              </option>
            ))}
          </select>
          <button
            onClick={() => void fetchJobs()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Filter className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
            <span className="ml-3 text-sm text-muted-foreground">Loading history\u2026</span>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <XCircle className="mx-auto h-8 w-8 text-red-500" />
            <p className="mt-2 text-sm text-red-500">{error}</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-16 text-center">
            <HistoryIcon className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              {jobs.length === 0
                ? "You haven't generated any contracts yet."
                : "No jobs match your filters."}
            </p>
            {jobs.length === 0 && (
              <Link
                href="/"
                className="mt-4 inline-flex items-center justify-center rounded-full bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent/90"
              >
                Generate your first contract
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {visible.map((job) => (
              <JobCard key={job.job_id} job={job} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
