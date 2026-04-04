import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { jobsApi } from "@/api/jobs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Spinner } from "@/components/ui/Spinner";
import type { Job, ModuleProgress } from "@/types";

const MODULE_LABELS: Record<string, string> = {
  uniprot:    "UniProt Annotation",
  string:     "STRING Network",
  gprofiler:  "Functional Enrichment",
  hpa:        "HPA Concentrations",
  signalp:    "Signal Peptide",
  pharos:     "Pharos Drug Targets",
  sasp:       "SASP Flagging",
  comparison: "Two-Set Comparison",
};

export default function JobStatus() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const wsRef = useRef<WebSocket | null>(null);
  const [wsJob, setWsJob] = useState<Job | null>(null);

  // Fallback HTTP polling
  const { data: httpJob } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => jobsApi.get(jobId!),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 3000;
    },
    enabled: !!jobId,
  });

  // Merge WS partial updates (status, progress) onto the full HTTP job object
  const job: Job | undefined = httpJob
    ? { ...httpJob, ...(wsJob ?? {}) }
    : undefined;

  // Auto-redirect when job completes — uses jobId from URL, never from job object
  useEffect(() => {
    if (!jobId || jobId === "undefined") return;
    if (job?.status === "completed") {
      navigate(job.job_type === "comparison" ? `/comparison/${jobId}` : `/results/${jobId}`, { replace: true });
    }
  }, [job?.status, job?.job_type, jobId, navigate]);

  // WebSocket for real-time updates
  useEffect(() => {
    if (!jobId) return;
    const apiUrl = import.meta.env.VITE_API_URL ?? "";
    const wsBase = apiUrl
      ? apiUrl.replace("https://", "wss://").replace("http://", "ws://")
      : `ws://${window.location.host}`;
    const token = localStorage.getItem("secretome_token");
    const ws = new WebSocket(`${wsBase}/api/v1/ws/jobs/${jobId}?token=${token}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) return;
        // WS sends { job_id, status, progress } — store only those fields
        setWsJob({ status: data.status, progress: data.progress } as Job);
      } catch {}
    };
    ws.onerror = () => ws.close();
    return () => ws.close();
  }, [jobId]);

  if (!job) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  const modules = job.modules ?? [];
  const progress = job.progress ?? {};

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {job.label ?? "Analysis Job"}
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">{job.id}</p>
        </div>
        <Badge status={job.status} />
      </div>

      <Card>
        <CardHeader><CardTitle>Module Progress</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {modules.map((mod) => {
            const mp: ModuleProgress = progress[mod] ?? { status: "pending", percent: 0, message: "" };
            return (
              <div key={mod} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">{MODULE_LABELS[mod] ?? mod}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge status={mp.status} />
                    {mp.status === "running" && <Spinner size="sm" />}
                  </span>
                </div>
                <ProgressBar value={mp.percent} status={mp.status} />
                {mp.message && (
                  <p className="text-xs text-gray-400">{mp.message}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {job.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <strong>Error:</strong> {job.error_message}
        </div>
      )}

      <div className="flex gap-3">
        {job.status === "completed" && (
          <Button onClick={() => navigate(
            job.job_type === "comparison" ? `/comparison/${jobId}` : `/results/${jobId}`
          )}>
            View Results
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate("/jobs")}>
          All Jobs
        </Button>
      </div>
    </div>
  );
}
