import { NextResponse, type NextRequest } from "next/server";
import { checkOwner, ownerErrorResponse } from "@/lib/auth";

// Gate every page and API route behind the owner's Basic auth credentials.
// Route handlers re-check with requireOwner() in case this matcher changes.
export function proxy(request: NextRequest) {
  const check = checkOwner(request);
  if (check.ok) return NextResponse.next();

  const isApi = request.nextUrl.pathname.startsWith("/api/");
  return ownerErrorResponse(check, isApi ? "json" : "text");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
