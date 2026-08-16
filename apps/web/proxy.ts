import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/firebase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Resolve auth state on PAGES so the distribution gate can redirect
     * anonymous visitors before a server component renders. Skip:
     * - _next/static (build assets)
     * - _next/image (image optimizer)
     * - favicon.ico
     * - API routes where a proxy refresh per request is pure waste —
     *   api/session is polled every ~1.2s by the prep screen and reads no
     *   auth; api/coach + api/upload resolve the user in-handler and
     *   self-gate via @deepinterview/ee; api/health is identity-free.
     * api/kb stays matched (kb/query resolves the user). The distribution gate
     * in updateSession applies to pages only; API handlers self-gate with 401s.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/session|api/coach|api/upload).*)",
  ],
};
