import { NextResponse } from "next/server";
import { GATE_COOKIE } from "@/lib/gate";

/** Lock the dashboard again (clears the access-code cookie). */
export async function POST(request: Request) {
  const res = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  res.cookies.set(GATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
