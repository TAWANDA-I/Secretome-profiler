import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useJobStore } from "@/store";
import type { JobSummary } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

interface Toast { id: number; message: string; ok: boolean }

export default function Jobs() {
  const navigate = useNavigate();
  const { jobs, loading, fetchJobs, deleteJob } = useJobStore();
  const [confirmJob, setConfirmJob] = useState<JobSummary | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const pushToast = (message: string, ok: boolean) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, ok }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  };

  const handleDelete = async (job: JobSummary) => {
    setConfirmJob(null);
    setDeleting(job.id);
    try {
      await deleteJob(job.id);
      pushToast(`Job "${job.label ?? job.id.slice(0, 8)}" deleted.`, true);
    } catch {
      pushToast("Delete failed — please try again.", false);
      fetchJobs(); // restore list if optimistic update failed
    } finally {
      setDeleting(null);
    }
  };

  const completedJobs = jobs.filter((j) => j.status === "completed");

  const handleDeleteAllCompleted = async () => {
    for (const job of completedJobs) {
      try { await deleteJob(job.id); } catch { /* continue */ }
    }
    pushToast(`Deleted ${completedJobs.length} completed job${completedJobs.length !== 1 ? "s" : ""}.`, true);
  };

  const counts = {
    total: jobs.length,
    running: jobs.filter((j) => j.status === "running").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-4">
      {/* Toast stack */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2 rounded-lg shadow-lg text-sm text-white transition-all ${
              t.ok ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmJob(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Delete job?</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <p><span className="font-medium">Label:</span> {confirmJob.label ?? "Untitled"}</p>
              <p><span className="font-medium">ID:</span> <span className="font-mono text-xs">{confirmJob.id.slice(0, 8)}</span></p>
              <p><span className="font-medium">Status:</span> {confirmJob.status}</p>
            </div>
            <p className="text-xs text-gray-400">This will permanently remove the job and all its stored results.</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setConfirmJob(null)}>Cancel</Button>
              <button
                onClick={() => handleDelete(confirmJob)}
                className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Jobs</h1>
          {counts.total > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {counts.total} total · {counts.running} running · {counts.completed} completed · {counts.failed} failed
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {completedJobs.length >= 2 && (
            <button
              onClick={handleDeleteAllCompleted}
              className="text-xs text-red-500 hover:text-red-700 hover:underline"
            >
              Delete all completed ({completedJobs.length})
            </button>
          )}
          <Button size="sm" onClick={() => navigate("/")}>+ New Analysis</Button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      )}

      {!loading && jobs.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-gray-400 text-sm">
            No jobs yet. <Link to="/" className="text-primary-600 hover:underline">Start an analysis.</Link>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
          <Card
            key={job.id}
            className="cursor-pointer hover:border-primary-300 transition-colors"
            onClick={() => {
              if (job.status === "completed" && job.job_type === "comparison") {
                navigate(`/comparison/${job.id}`);
              } else {
                navigate(`/jobs/${job.id}`);
              }
            }}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    {job.job_type === "comparison" && job.set_a_label && job.set_b_label
                      ? `${job.set_a_label} vs ${job.set_b_label}`
                      : (job.label ?? "Untitled Job")}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {job.job_type === "comparison" && (
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Comparison</span>
                  )}
                  <Badge status={job.status} />
                  <button
                    disabled={deleting === job.id}
                    onClick={() => setConfirmJob(job)}
                    className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                    title="Delete job"
                    aria-label="Delete job"
                  >
                    {deleting === job.id ? (
                      <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-red-400 rounded-full animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-xs text-gray-400">
              <span className="font-mono">{job.id}</span>
              <span>{new Date(job.created_at).toLocaleString()}</span>
            </CardContent>
          </Card>
        ))}

      </div>
    </div>
  );
}
