import { createGateway } from "@ai-sdk/gateway";
import { hasAiGateway } from "@/lib/env";

let gatewayInstance: ReturnType<typeof createGateway> | null = null;

export function getGateway() {
  if (!hasAiGateway()) {
    throw new Error(
      "AI_GATEWAY_API_KEY is not configured. Add it to your environment to enable AI features.",
    );
  }

  if (!gatewayInstance) {
    gatewayInstance = createGateway({
      apiKey: process.env.AI_GATEWAY_API_KEY,
    });
  }

  return gatewayInstance;
}

export function getDesignerModel() {
  const modelId =
    process.env.DESIGNER_MODEL ?? "anthropic/claude-sonnet-5";
  return getGateway()(modelId);
}

export function getImageModel() {
  const modelId =
    process.env.IMAGE_MODEL ?? "google/gemini-2.5-flash-image";
  return getGateway()(modelId);
}
