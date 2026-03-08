"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, Code2 } from "lucide-react";
import Link from "next/link";

interface JobStatus {
  job_id: string;
  status: "queued" | "running" | "complete" | "failed";
  current_step: string;
  progress: number;
  error_message?: string;
}

interface JobResult {
  job_id: string;
  status: string;
  contract_id?: string;
  package_id?: string;
  generated_code?: string;
  error_message?: string;
  compile_errors?: string[];
}

export default function SandboxPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [showCode, setShowCode] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  useEffect(() => {
    if (!jobId) return;

    const pollStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/status/${jobId}`);
        if (!response.ok) {
          if (response.status === 404) {
            router.push("/");
          }
          return;
        }

        const statusData: JobStatus = await response.json();
        setStatus(statusData);

        if (statusData.status === "complete" || statusData.status === "failed") {
          fetchResult();
        } else {
          setTimeout(pollStatus, 2000);
        }
      } catch (error) {
        console.error("Polling error:", error);
        setTimeout(pollStatus, 2000);
      }
    };

    const fetchResult = async () => {
      try {
        const response = await fetch(`${API_URL}/result/${jobId}`);
        if (!response.ok) return;

        const resultData: JobResult = await response.json();
        setResult(resultData);
      } catch (error) {
        console.error("Error fetching result:", error);
      }
    };

    pollStatus();
  }, [jobId, API_URL, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link 
              href="/"
              className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
            <h1 className="text-4xl font-bold mt-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Canton Sandbox
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Generating and deploying your DAML contract
            </p>
          </div>

          {/* Status Section */}
          {status && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
              <div className="flex items-center gap-3 mb-6">
                {status.status === "queued" || status.status === "running" ? (
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                ) : status.status === "complete" ? (
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                ) : (
                  <XCircle className="w-8 h-8 text-red-600" />
                )}
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {status.status === "complete" 
                      ? "Contract Deployed" 
                      : status.status === "failed" 
                      ? "Generation Failed" 
                      : "Processing"}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Job ID: {jobId.substring(0, 8)}...
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600 dark:text-gray-400">{status.current_step}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{status.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                </div>

                {status.error_message && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-red-800 dark:text-red-200 text-sm font-medium">{status.error_message}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Success Result */}
          {result && result.status === "complete" && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 space-y-6">
              <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                <div className="flex items-start gap-3 mb-4">
                  <CheckCircle2 className="w-6 h-6 text-green-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-green-900 dark:text-green-100 text-lg">
                      Successfully Deployed to Canton
                    </h3>
                    <p className="text-green-700 dark:text-green-300 text-sm mt-1">
                      Your contract is now live on the Canton ledger
                    </p>
                  </div>
                </div>
                
                <div className="space-y-3 mt-4">
                  {result.contract_id && (
                    <div className="bg-white dark:bg-gray-900 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Contract ID</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                        {result.contract_id}
                      </p>
                    </div>
                  )}
                  {result.package_id && (
                    <div className="bg-white dark:bg-gray-900 rounded-lg p-4">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Package ID</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                        {result.package_id}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {result.generated_code && (
                <div>
                  <button
                    onClick={() => setShowCode(!showCode)}
                    className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium mb-3 transition-colors"
                  >
                    <Code2 className="w-5 h-5" />
                    {showCode ? "Hide" : "View"} Generated DAML Code
                  </button>
                  
                  {showCode && (
                    <pre className="bg-gray-900 text-gray-100 p-6 rounded-xl overflow-x-auto text-sm border border-gray-700">
                      <code>{result.generated_code}</code>
                    </pre>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
                >
                  Generate Another Contract
                </Link>
              </div>
            </div>
          )}

          {/* Failure Result */}
          {result && result.status === "failed" && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <div className="flex items-start gap-3 mb-3">
                  <XCircle className="w-6 h-6 text-red-600 mt-1" />
                  <div>
                    <h3 className="font-semibold text-red-900 dark:text-red-100 text-lg">
                      Generation Failed
                    </h3>
                    {result.error_message && (
                      <p className="text-red-700 dark:text-red-300 text-sm mt-2">
                        {result.error_message}
                      </p>
                    )}
                  </div>
                </div>
                
                {result.compile_errors && result.compile_errors.length > 0 && (
                  <div className="mt-4 bg-white dark:bg-gray-900 rounded-lg p-4">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                      Compilation Errors:
                    </p>
                    <div className="space-y-1">
                      {result.compile_errors.map((error, i) => (
                        <p key={i} className="text-xs text-red-700 dark:text-red-300 font-mono">
                          {error}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-6">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg"
                >
                  Try Again
                </Link>
              </div>
            </div>
          )}

          {!status && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-12 text-center">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400">Loading job status...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
