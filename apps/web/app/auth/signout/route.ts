import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/firebase/server";

/**
 * Sign the user out and redirect home. Clearing the ID-token cookie is what
 * signs them out server-side; the browser SDK drops its own session via the
 * token listener, so this works whether or not Firebase is configured.
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url), {
    status: 303,
  });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
  return response;
}
