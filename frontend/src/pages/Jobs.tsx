import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useJobStore } from "@/store";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";

export default function Jobs() {
  const navigate = useNavigate();
  const { jobs, loading, fetchJobs } = useJobStore();

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">My Jobs</h1>
        <Button size="sm" onClick={() => navigate("/")}>+ New Analysis</Button>
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
            onClick={() => navigate(`/jobs/${job.id}`)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{job.label ?? "Untitled Job"}</CardTitle>
                <Badge status={job.status} />
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
