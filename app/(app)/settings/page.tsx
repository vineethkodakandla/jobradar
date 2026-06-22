import { SettingsView } from "@/components/settings/settings-view";

// Settings: sources overview, default filters, scrape health (ET), CSV export,
// manual scrape trigger, and sign-out.
export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <SettingsView />
    </div>
  );
}
