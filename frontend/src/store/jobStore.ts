import { create } from "zustand";
import type { Job, JobCreate, JobSummary } from "@/types";
import { jobsApi } from "@/api/jobs";

interface JobStore {
  jobs: JobSummary[];
  currentJob: Job | null;
  loading: boolean;
  error: string | null;
  fetchJobs: () => Promise<void>;
  createJob: (payload: JobCreate) => Promise<Job>;
  deleteJob: (id: string) => Promise<void>;
  setCurrentJob: (job: Job | null) => void;
  clearError: () => void;
}

export const useJobStore = create<JobStore>((set) => ({
  jobs: [],
  currentJob: null,
  loading: false,
  error: null,

  fetchJobs: async () => {
    set({ loading: true, error: null });
    try {
      const jobs = await jobsApi.list();
      set({ jobs, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  createJob: async (payload) => {
    set({ loading: true, error: null });
    try {
      const job = await jobsApi.create(payload);
      set((s) => ({
        jobs: [{ id: job.id, status: job.status, job_type: job.job_type, label: job.label,
                  set_a_label: job.set_a_label, set_b_label: job.set_b_label,
                  created_at: job.created_at, updated_at: job.updated_at }, ...s.jobs],
        currentJob: job,
        loading: false,
      }));
      return job;
    } catch (err) {
      set({ error: String(err), loading: false });
      throw err;
    }
  },

  deleteJob: async (id) => {
    // Optimistic update: remove immediately
    set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }));
    try {
      await jobsApi.delete(id);
    } catch (err) {
      // Roll back on failure
      set({ error: String(err) });
      throw err;
    }
  },

  setCurrentJob: (job) => set({ currentJob: job }),
  clearError: () => set({ error: null }),
}));
