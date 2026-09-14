import { addImages, toClient } from "@/lib/ai/styles";
import {
  apiError,
  checkAiConfig,
  checkBlobConfig,
  streamStatus,
} from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const blobError = checkBlobConfig();
  if (blobError) return blobError;
  const aiError = checkAiConfig();
  if (aiError) return aiError;

  try {
    const { id } = await params;
    const body = await request.json();
    const { images, stream } = body as {
      images?: unknown;
      stream?: boolean;
    };

    if (!Array.isArray(images) || images.length === 0) {
      return apiError("At least one image is required", 400);
    }
    if (!images.every((image) => typeof image === "string")) {
      return apiError("Images must be data URLs", 400);
    }

    const run = async (send?: (status: string) => void) => {
      const manifest = await addImages(id, images as string[], send);
      send?.("Style saved");
      return { style: toClient(manifest) };
    };

    if (stream) {
      return streamStatus(async (send) => run(send));
    }

    return Response.json(await run());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add images";
    return apiError(message);
  }
}
