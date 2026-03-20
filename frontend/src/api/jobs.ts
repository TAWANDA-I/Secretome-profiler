import type { Job, JobCreate, JobSummary } from "@/types";
import api from "./index";

export const jobsApi = {
  create: (payload: JobCreate) =>
    api.post<Job>("/jobs/", payload).then((r) => r.data),

  list: (skip = 0, limit = 50) =>
    api.get<JobSummary[]>("/jobs/", { params: { skip, limit } }).then((r) => r.data),

  get: (id: string) =>
    api.get<Job>(`/jobs/${id}`).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/jobs/${id}`),
};
