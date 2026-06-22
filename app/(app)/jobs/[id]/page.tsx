import { JobDetailStandalone } from "@/components/feed/job-detail-standalone";

// Standalone, deep-linkable job detail. The id comes from the route param;
// JobDetail fetches the full JobWithFit client-side.
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  return <JobDetailStandalone jobId={Number.isFinite(jobId) ? jobId : null} />;
}
