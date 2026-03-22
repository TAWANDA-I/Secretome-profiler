export type JobStatus = "pending" | "running" | "completed" | "failed";

export type ModuleName =
  | "uniprot"
  | "string"
  | "gprofiler"
  | "hpa"
  | "signalp"
  | "pharos"
  | "sasp"
  | "comparison"
  | "therapeutic"
  | "receptor_ligand"
  | "safety"
  | "disease_context";

export interface ModuleProgress {
  status: JobStatus;
  percent: number;
  message: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  job_type: "single" | "comparison";
  proteins: string[];
  modules: string[];
  progress: Record<string, ModuleProgress>;
  error_message: string | null;
  label: string | null;
  proteins_a: string[] | null;
  proteins_b: string[] | null;
  set_a_label: string | null;
  set_b_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobSummary {
  id: string;
  status: JobStatus;
  job_type: "single" | "comparison";
  label: string | null;
  set_a_label: string | null;
  set_b_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobCreate {
  job_type?: "single" | "comparison";
  // single mode
  proteins?: string[];
  modules?: ModuleName[];
  label?: string;
  // comparison mode
  set_a_proteins?: string[];
  set_a_label?: string;
  set_b_proteins?: string[];
  set_b_label?: string;
}
