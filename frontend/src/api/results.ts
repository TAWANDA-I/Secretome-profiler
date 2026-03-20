import type { DownloadURL, Result } from "@/types";
import api from "./index";

export const resultsApi = {
  forJob: (jobId: string) =>
    api.get<Result[]>(`/results/job/${jobId}`).then((r) => r.data),

  get: (id: string) =>
    api.get<Result>(`/results/${id}`).then((r) => r.data),

  /** Full MinIO payload for a module — powers the detail panels. */
  getModuleData: (jobId: string, moduleName: string) =>
    api
      .get<unknown>(`/results/job/${jobId}/${moduleName}/data`)
      .then((r) => r.data),

  downloadUrl: (id: string) =>
    api.get<DownloadURL>(`/results/${id}/download`).then((r) => r.data),
};
