import { withRoomPhotoAspectRatio } from "@/lib/ai/aspect-ratio";
import { assembleRefineInstruction } from "@/lib/ai/prompt";
import { renderRoom, toClientRenderResult } from "@/lib/ai/render";
import { critiqueRender } from "@/lib/ai/critique";
import {
  dataUrlToImageInput,
  urlToImageInput,
  type ImageInput,
} from "@/lib/ai/images";
import { parsePiecePayloads } from "@/lib/ai/pieces";
import { resolveStyle } from "@/lib/ai/styles";
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
    const {
      designBrief,
      roomImage,
      currentRenderUrl,
      instruction,
      styleReferences = [],
      styleId,
      pieceReferences: pieceReferencesRaw = [],
      qualityGate = true,
      stream,
    } = body;

    const parsedBrief = designBriefSchema.safeParse(designBrief);
    if (!parsedBrief.success) {
      return apiError("Invalid design brief", 400);
    }

    if (!roomImage || !currentRenderUrl || !instruction) {
      return apiError(
        "Room image, current render, and refinement instruction are required",
        400,
      );
    }

    const roomImageInput = dataUrlToImageInput(roomImage);
    const brief = await withRoomPhotoAspectRatio(
      parsedBrief.data,
      roomImageInput,
    );
    const currentRender = await urlToImageInput(currentRenderUrl);

    let pieceReferences;
    try {
      pieceReferences = parsePiecePayloads(pieceReferencesRaw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid piece references";
      return apiError(message, 400);
    }

    let styleRefInputs: ImageInput[];
    if (typeof styleId === "string" && styleId) {
      styleRefInputs = (await resolveStyle(styleId)).images;
    } else {
      styleRefInputs = (styleReferences as string[]).map((url) =>
        dataUrlToImageInput(url),
      );
    }
    const refineInstruction = assembleRefineInstruction(brief, instruction);

    const runRefine = async (send?: (status: string) => void) => {
      send?.("Applying refinement…");

      let result = await renderRoom({
        instruction: refineInstruction,
        roomImage: roomImageInput,
        styleReferences: styleRefInputs,
        pieceReferences,
        currentRender,
      });

      if (qualityGate) {
        send?.("Running quality check…");
        const critique = await critiqueRender({
          brief,
          renderImage: result.image,
          roomImage: roomImageInput,
        });

        if (!critique.passed && critique.correctiveInstruction) {
          send?.("Auto-refining based on quality check…");
          result = await renderRoom({
            instruction: assembleRefineInstruction(
              brief,
              critique.correctiveInstruction,
            ),
            roomImage: roomImageInput,
            styleReferences: styleRefInputs,
            pieceReferences,
            currentRender: result.image,
          });
        }
      }

      send?.("Refinement complete");
      return toClientRenderResult(result);
    };

    if (stream) {
      return streamStatus(async (send) => runRefine(send));
    }

    const result = await runRefine();
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Refinement failed";
    return apiError(message);
  }
}
