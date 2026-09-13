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
  process.env.DESIGNER_MODEL ?? "anthropic/claude-sonnet-5";

export const DEFAULT_IMAGE_MODEL =
  process.env.IMAGE_MODEL ?? "google/gemini-2.5-flash-image";
