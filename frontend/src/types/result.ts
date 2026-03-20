export interface Result {
  id: string;
  job_id: string;
  module_name: string;
  minio_key: string | null;
  summary: Record<string, unknown>;
  created_at: string;
}

export interface DownloadURL {
  url: string;
  expires_in: number;
}
