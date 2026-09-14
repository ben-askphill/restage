import { get } from "@vercel/blob";
import { isAllowedBlobPathname } from "@/lib/blob";
import { apiError, checkBlobConfig } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const blobError = checkBlobConfig();
  if (blobError) return blobError;

  const { searchParams } = new URL(request.url);
  const pathname = searchParams.get("pathname");

  if (!pathname || !isAllowedBlobPathname(pathname)) {
    return apiError("Invalid pathname", 400);
  }

  const result = await get(pathname, { access: "private" });
  if (result?.statusCode !== 200) {
    return apiError("Not found", 404);
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
