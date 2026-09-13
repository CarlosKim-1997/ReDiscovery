import { NextResponse, type NextRequest } from "next/server";
import { refreshAuthCookies } from "@/adapters/supabase-auth/proxy";

export function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key && process.env.AUTH_APP_ORIGIN && process.env.AUTH_COOKIE_SECRET ? refreshAuthCookies(request, url, key) : NextResponse.next({ request });
}
export const config = { matcher: ["/result/:path*", "/reveal/:path*"] };
