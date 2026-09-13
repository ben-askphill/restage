import { assembleImageInstruction } from "@/lib/ai/prompt";
import { renderRoom } from "@/lib/ai/render";
import { critiqueRender } from "@/lib/ai/critique";
import { dataUrlToImageInput, urlToImageInput } from "@/lib/ai/images";
import { designBriefSchema } from "@/lib/ai/schemas";
import {
  apiError,
  checkAiConfig,
  checkBlobConfig,
  streamStatus,
} from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const aiError = checkAiConfig();
  if (aiError) return aiError;
  const blobError = checkBlobConfig();
  if (blobError) return blobError;

  try {
    const body = await request.json();
    const { designBrief, roomImage, styleReferences = [], qualityGate = true, stream } =
      body;

    const parsedBrief = designBriefSchema.safeParse(designBrief);
    if (!parsedBrief.success) {
      return apiError("Invalid design brief", 400);
    }

    if (!roomImage) {
      return apiError("Room image is required", 400);
    }

    const roomImageInput = dataUrlToImageInput(roomImage);
    const styleRefInputs = (styleReferences as string[]).map((url) =>
      dataUrlToImageInput(url),
    );
    const instruction = assembleImageInstruction(parsedBrief.data);

    const runRender = async (send?: (status: string) => void) => {
      send?.("Assembling image instruction…");
      send?.("Rendering redesigned room…");

      let result = await renderRoom({
        instruction,
        roomImage: roomImageInput,
        styleReferences: styleRefInputs,
      });

      if (qualityGate) {
        send?.("Running quality check…");
        const renderImage = await urlToImageInput(result.imageUrl);
        const critique = await critiqueRender({
          brief: parsedBrief.data,
          renderImage,
          roomImage: roomImageInput,
        });

        if (!critique.passed && critique.correctiveInstruction) {
          send?.("Auto-refining based on quality check…");
          const refineInstruction = `${instruction}\n\nCORRECTION REQUIRED:\n${critique.correctiveInstruction}`;
          result = await renderRoom({
            instruction: refineInstruction,
            roomImage: roomImageInput,
            styleReferences: styleRefInputs,
            currentRender: renderImage,
          });
        }
      }

      send?.("Render complete");
      return result;
    };

    if (stream) {
      return streamStatus(async (send) => runRender(send));
    }

    const result = await runRender();
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Render failed";
    return apiError(message);
  }
}
