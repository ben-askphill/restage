export function getEnv(key: string, fallback?: string): string | undefined {
  const value = process.env[key];
  if (value) return value;
  return fallback;
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. See .env.example for setup.`,
    );
  }
  return value;
}

export function hasAiGateway(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY);
}

export function hasBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export const DEFAULT_DESIGNER_MODEL =
  process.env.DESIGNER_MODEL ?? "deepseek/deepseek-v4-flash-vision-exp";

export const DEFAULT_IMAGE_MODEL =
  process.env.IMAGE_MODEL ?? "google/gemini-3.1-flash-image";

// Gemini image resolution: low → 512, medium/auto → 1K, high → 2K.
// Aspect ratio is not configured here. Render and refine measure the room photo.
export const DEFAULT_IMAGE_QUALITY = process.env.IMAGE_QUALITY ?? "high";
