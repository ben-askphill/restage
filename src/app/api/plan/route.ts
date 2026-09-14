import { planDesign } from "@/lib/ai/plan";
import { dataUrlToImageInput } from "@/lib/ai/images";
import { roomInventorySchema } from "@/lib/ai/schemas";
import { apiError, checkAiConfig, streamStatus } from "@/lib/api";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const planRequestSchema = z.object({
  inventory: roomInventorySchema,
  keepItems: z.array(z.string()),
  roomImage: z.string().min(1),
});

export async function POST(request: Request) {
  const configError = checkAiConfig();
  if (configError) return configError;

  try {
    const body = await request.json();
    const { stream, ...payload } = body as { stream?: boolean };
    const parsed = planRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError("Invalid plan request", 400);
    }

    const roomImage = dataUrlToImageInput(parsed.data.roomImage);

    if (stream) {
      return streamStatus(async (send) => {
        send("Designing around the pieces you kept…");
        const brief = await planDesign({
          inventory: parsed.data.inventory,
          keepItems: parsed.data.keepItems,
          roomImage,
        });
        send("Design strategy ready");
        return brief;
      });
    }

    const brief = await planDesign({
      inventory: parsed.data.inventory,
      keepItems: parsed.data.keepItems,
      roomImage,
    });

    return Response.json(brief);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Design planning failed";
    return apiError(message);
  }
}
