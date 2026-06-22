"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { JobDetail } from "./job-detail";

export interface JobDetailStandaloneProps {
  jobId: number | null;
}

/** Wraps JobDetail with its own scroll container + back link for the
 *  standalone /jobs/[id] route. */
export function JobDetailStandalone({ jobId }: JobDetailStandaloneProps) {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl">
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-5 py-2 backdrop-blur">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to feed
          </Link>
        </div>
        <JobDetail jobId={jobId} />
      </div>
    </div>
  );
}
