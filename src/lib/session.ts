import { cookies, headers } from "next/headers";
import { USER_ID_COOKIE } from "@/proxy";

/**
 * Resolves the anonymous per-visitor id set by `proxy.ts`. On the very
 * first request for a new visitor, the cookie hasn't reached the browser
 * yet, so proxy also forwards it via the `x-ir-watch-uid` request header.
 */
export async function getUserId(): Promise<string> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(USER_ID_COOKIE)?.value;
  if (fromCookie) return fromCookie;

  const headerStore = await headers();
  const fromHeader = headerStore.get("x-ir-watch-uid");
  if (fromHeader) return fromHeader;

  throw new Error(
    "Missing anonymous user id: proxy.ts did not run for this request"
  );
}
