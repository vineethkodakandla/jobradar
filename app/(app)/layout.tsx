import { redirect } from "next/navigation";
import { getGateOwner } from "@/lib/auth-helpers";
import { AppShell } from "@/components/app-shell";

/**
 * Auth-gated group. Defense in depth (in addition to middleware): require a
 * valid access-code cookie, else bounce to the gate.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ok } = await getGateOwner();
  if (!ok) redirect("/login");

  return <AppShell>{children}</AppShell>;
}
