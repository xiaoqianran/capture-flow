export interface JobLike {
  id?: string;
  status?: string;
  error_code?: string;
  error_message?: string;
  document_id?: string;
  revision_id?: string;
  adapter?: string;
  collector?: string;
  trace?: string[];
}

export function isTerminalJobStatus(status: string | undefined): boolean {
  return status === "done" || status === "failed" || status === "cancelled";
}

export function formatJobFailure(job: JobLike): string {
  const parts: string[] = [];
  if (job.error_code) parts.push(job.error_code);
  if (job.error_message) parts.push(job.error_message);
  if (job.trace?.length) parts.push(`trace: ${job.trace.slice(-4).join(" → ")}`);
  return parts.join(" | ") || "capture failed";
}

export function formatJobLine(job: JobLike): string {
  const lines = [
    job.id ? `id: ${job.id}` : null,
    job.status ? `status: ${job.status}` : null,
    job.adapter ? `adapter: ${job.adapter}` : null,
    job.collector ? `collector: ${job.collector}` : null,
    job.document_id ? `document_id: ${job.document_id}` : null,
    job.revision_id ? `revision_id: ${job.revision_id}` : null,
    job.trace?.length ? `trace: ${job.trace.join(" → ")}` : null,
    job.error_code ? `error: ${job.error_code} ${job.error_message || ""}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}
