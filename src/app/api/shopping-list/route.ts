import { generateShoppingList } from "@/lib/ai/shopping";
import { dataUrlToImageInput, urlToImageInput } from "@/lib/ai/images";
import { designBriefSchema } from "@/lib/ai/schemas";
import { apiError, checkAiConfig, streamStatus } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const configError = checkAiConfig();
  if (configError) return configError;

  try {
    const body = await request.json();
    const { designBrief, renderUrl, renderDataUrl, stream } = body;

    const parsedBrief = designBriefSchema.safeParse(designBrief);
    if (!parsedBrief.success) {
      return apiError("Invalid design brief", 400);
    }

    if (!renderUrl && !renderDataUrl) {
      return apiError("Render image is required", 400);
    }

    const renderImage = renderDataUrl
      ? dataUrlToImageInput(renderDataUrl)
      : await urlToImageInput(renderUrl);

    if (stream) {
      return streamStatus(async (send) => {
        send("Sourcing furniture for your region…");
        const list = await generateShoppingList({
          brief: parsedBrief.data,
          renderImage,
        });
        send("Shopping list ready");
        return list;
      });
    }

    const list = await generateShoppingList({
      brief: parsedBrief.data,
      renderImage,
    });

    return Response.json(list);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Shopping list generation failed";
    return apiError(message);
  }
}
