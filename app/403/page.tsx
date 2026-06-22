import Link from "next/link";

export const metadata = { title: "Not authorized · JobRadar" };

export default function NotOwnerPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium text-fit-low">403 — Not authorized</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          This JobRadar is private
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;re signed in, but this account isn&apos;t the owner. JobRadar
          is a single-user dashboard.
        </p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Sign out
          </button>
        </form>
        <Link
          href="/login"
          className="mt-3 inline-block text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
