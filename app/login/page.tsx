import { redirect } from "next/navigation";
import { getGateOwner } from "@/lib/auth-helpers";
import { GateCard } from "@/components/gate-card";

export const metadata = { title: "JobRadar — Private" };

export default async function LoginPage() {
  const { ok } = await getGateOwner();
  if (ok) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">JobRadar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A private job radar built by Vineeth Reddy Kodakandla.
          </p>
        </div>
        <GateCard />
      </div>
    </main>
  );
}
