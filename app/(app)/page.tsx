import { FeedShell } from "@/components/feed/feed-shell";

// The feed: three-pane FilterRail | JobList | JobDetail. Filter + selected-job
// state both live in the URL (nuqs) so it's shareable/deep-linkable.
export default function FeedPage() {
  return <FeedShell />;
}
