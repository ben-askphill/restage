import { createStyle, listStyles, toClient } from "@/lib/ai/styles";
import { apiError, checkBlobConfig } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  const blobError = checkBlobConfig();
  if (blobError) return blobError;

  try {
    const styles = await listStyles();
    return Response.json({ styles });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list styles";
    return apiError(message);
  }
}

export async function POST(request: Request) {
  const blobError = checkBlobConfig();
  if (blobError) return blobError;

  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name : "";
    if (!name.trim()) {
      return apiError("A style name is required", 400);
    }

    const manifest = await createStyle(name);
    return Response.json({ style: toClient(manifest) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create style";
    return apiError(message);
  }
}
