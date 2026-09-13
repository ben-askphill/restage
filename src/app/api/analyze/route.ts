import { analyzeRoom } from "@/lib/ai/analyze";
import { dataUrlToImageInput } from "@/lib/ai/images";
import { userBriefInputSchema } from "@/lib/ai/schemas";
import { apiError, checkAiConfig, streamStatus } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const configError = checkAiConfig();
  if (configError) return configError;

  try {
    const body = await request.json();
    const { roomImages, floorPlan, userBrief, stream } = body;

    if (!roomImages?.length) {
      return apiError("At least one room image is required", 400);
    }

    const parsedBrief = userBriefInputSchema.safeParse(userBrief);
    if (!parsedBrief.success) {
      return apiError("Invalid user brief", 400);
    }

    const roomImageInputs = roomImages.map((url: string) =>
      dataUrlToImageInput(url),
    );
    const floorPlanInput = floorPlan
      ? dataUrlToImageInput(floorPlan)
      : undefined;

    if (stream) {
      return streamStatus(async (send) => {
        send("Analyzing room architecture and lighting…");
        const brief = await analyzeRoom({
          roomImages: roomImageInputs,
          floorPlan: floorPlanInput,
          userBrief: parsedBrief.data,
        });
        send("Design brief complete");
        return brief;
      });
    }

    const brief = await analyzeRoom({
      roomImages: roomImageInputs,
      floorPlan: floorPlanInput,
      userBrief: parsedBrief.data,
    });

    return Response.json(brief);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    return apiError(message);
  }
}
