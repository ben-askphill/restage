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
  process.env.IMAGE_MODEL ?? "google/gemini-2.5-flash-image";

// Output resolution. gpt-image accepts 1024x1024, 1536x1024, 1024x1536, or auto.
export const DEFAULT_IMAGE_SIZE = process.env.IMAGE_SIZE ?? "1536x1024";

// Rendering quality: low | medium | high | auto.
export const DEFAULT_IMAGE_QUALITY = process.env.IMAGE_QUALITY ?? "high";
