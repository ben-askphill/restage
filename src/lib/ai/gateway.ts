import { createGateway } from "@ai-sdk/gateway";
import {
  DEFAULT_DESIGNER_MODEL,
  DEFAULT_IMAGE_MODEL,
  hasAiGateway,
} from "@/lib/env";

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
  return getGateway()(DEFAULT_DESIGNER_MODEL);
}

export function getImageModel() {
  return getGateway().imageModel(DEFAULT_IMAGE_MODEL);
}
