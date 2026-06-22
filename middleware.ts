import { NextResponse, type NextRequest } from "next/server";
import { GATE_COOKIE, verifyToken } from "@/lib/gate";

// Paths reachable without the access code: the gate page itself and the
// gate endpoint that grants it.
function isPublic(path: string): boolean {
  return (
    path === "/login" ||
    path === "/api/gate" ||
    path === "/403" ||
    path.startsWith("/auth/")
  );
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (isPublic(path)) return NextResponse.next();

  const ok = await verifyToken(request.cookies.get(GATE_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (path.startsWith("/api")) {
    return NextResponse.json({ error: "locked" }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
