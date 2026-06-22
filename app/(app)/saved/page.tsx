import { FeedShell } from "@/components/feed/feed-shell";

// Saved jobs: the same three-pane feed, scoped to saved=1.
export default function SavedPage() {
  return <FeedShell savedOnly />;
}
