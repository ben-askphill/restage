import { withRoomPhotoAspectRatio } from "@/lib/ai/aspect-ratio";
import { assembleImageInstruction, assembleRefineInstruction } from "@/lib/ai/prompt";
import { renderRoom, toClientRenderResult } from "@/lib/ai/render";
import { critiqueRender } from "@/lib/ai/critique";
import { dataUrlToImageInput, type ImageInput } from "@/lib/ai/images";
import { parsePiecePayloads } from "@/lib/ai/pieces";
import { resolveStyle } from "@/lib/ai/styles";
import { styleProfileToText } from "@/lib/ai/style-profile";
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

    if (!roomImage) {
      return apiError("Room image is required", 400);
    }

    const roomImageInput = dataUrlToImageInput(roomImage);
    const brief = await withRoomPhotoAspectRatio(
      parsedBrief.data,
      roomImageInput,
    );

    let pieceReferences;
    try {
      pieceReferences = parsePiecePayloads(pieceReferencesRaw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid piece references";
      return apiError(message, 400);
    }

    // A saved style (styleId) supplies both its images and its text profile;
    // otherwise fall back to one-off data-URL references from the client.
    let styleRefInputs: ImageInput[];
    let styleProfileText: string | undefined;
    if (typeof styleId === "string" && styleId) {
      const resolved = await resolveStyle(styleId);
      styleRefInputs = resolved.images;
      styleProfileText = resolved.profile
        ? styleProfileToText(resolved.profile)
        : undefined;
    } else {
      styleRefInputs = (styleReferences as string[]).map((url) =>
        dataUrlToImageInput(url),
      );
    }

    const instruction = assembleImageInstruction(brief, styleProfileText);

    const runRender = async (send?: (status: string) => void) => {
      send?.("Assembling image instruction…");
      send?.("Rendering redesigned room…");

      let result = await renderRoom({
        instruction,
        roomImage: roomImageInput,
        styleReferences: styleRefInputs,
        pieceReferences,
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

      send?.("Render complete");
      return toClientRenderResult(result);
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
