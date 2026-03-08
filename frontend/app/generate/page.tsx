"use client";

import { useState } from "react";
import { ArrowRight, Loader2, CheckCircle2, XCircle } from "lucide-react";

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

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    setLoading(true);
    setJobId(null);
    setStatus(null);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          canton_environment: "sandbox",
        }),
      });

      if (!response.ok) throw new Error("Failed to start generation");

      const data = await response.json();
      setJobId(data.job_id);
      pollJobStatus(data.job_id);
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to start contract generation");
      setLoading(false);
    }
  };

  const pollJobStatus = async (id: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/status/${id}`);
        if (!response.ok) return;

        const statusData: JobStatus = await response.json();
        setStatus(statusData);

        if (statusData.status === "complete" || statusData.status === "failed") {
          setLoading(false);
          fetchResult(id);
        } else {
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    };

    poll();
  };

  const fetchResult = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/result/${id}`);
      if (!response.ok) return;

      const resultData: JobResult = await response.json();
      setResult(resultData);
    } catch (error) {
      console.error("Error fetching result:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Generate DAML Contract
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Describe your smart contract in plain English and we'll generate, compile, and deploy it to Canton
            </p>
          </div>

          {/* Input Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
            <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">
              Contract Description
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Create a bond contract between an issuer and investor with a face value, coupon rate, and maturity date"
              className="w-full h-32 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={loading}
            />
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  Generate Contract
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>

          {/* Status Section */}
          {status && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
              <div className="flex items-center gap-3 mb-4">
                {loading && <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />}
                {status.status === "complete" && <CheckCircle2 className="w-6 h-6 text-green-600" />}
                {status.status === "failed" && <XCircle className="w-6 h-6 text-red-600" />}
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {status.status === "complete" ? "Complete" : status.status === "failed" ? "Failed" : "Processing"}
                </h2>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600 dark:text-gray-400">{status.current_step}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{status.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                </div>

                {status.error_message && (
                  <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-red-800 dark:text-red-200 text-sm">{status.error_message}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Result Section */}
          {result && result.status === "complete" && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">Contract Deployed</h2>
              
              <div className="space-y-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-green-800 dark:text-green-200">Successfully deployed to Canton</span>
                  </div>
                  {result.contract_id && (
                    <p className="text-sm text-green-700 dark:text-green-300 font-mono break-all">
                      Contract ID: {result.contract_id}
                    </p>
                  )}
                  {result.package_id && (
                    <p className="text-sm text-green-700 dark:text-green-300 font-mono break-all mt-1">
                      Package ID: {result.package_id}
                    </p>
                  )}
                </div>

                {result.generated_code && (
                  <div>
                    <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">Generated DAML Code</h3>
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                      {result.generated_code}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          {result && result.status === "failed" && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="font-semibold text-red-800 dark:text-red-200">Generation Failed</span>
                </div>
                {result.error_message && (
                  <p className="text-sm text-red-700 dark:text-red-300 mt-2">{result.error_message}</p>
                )}
                {result.compile_errors && result.compile_errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">Compilation Errors:</p>
                    {result.compile_errors.map((error, i) => (
                      <p key={i} className="text-xs text-red-700 dark:text-red-300 font-mono">{error}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
