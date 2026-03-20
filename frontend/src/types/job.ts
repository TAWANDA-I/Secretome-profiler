export type JobStatus = "pending" | "running" | "completed" | "failed";

export type ModuleName =
  | "uniprot"
  | "string"
  | "gprofiler"
  | "hpa"
  | "signalp"
  | "pharos"
  | "sasp"
  | "comparison";

export interface ModuleProgress {
  status: JobStatus;
  percent: number;
  message: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  proteins: string[];
  modules: ModuleName[];
  progress: Record<ModuleName, ModuleProgress>;
  error_message: string | null;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobSummary {
  id: string;
  status: JobStatus;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobCreate {
  proteins: string[];
  modules?: ModuleName[];
  label?: string;
}
