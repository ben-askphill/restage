const BODY_TOO_LARGE =
  /payload too large|request entity too large|body too large|content too large|functional payload/i;

export function parseApiError(
  status: number,
  text: string,
  fallback = "Request failed",
): string {
  if (status === 413 || BODY_TOO_LARGE.test(text)) {
    return "That photo is too large to upload. Try a smaller image or fewer at once.";
  }

  const trimmed = text.trim();
  if (trimmed) {
    try {
      const data = JSON.parse(trimmed) as { error?: unknown };
      if (typeof data.error === "string" && data.error.trim()) {
        return data.error;
      }
    } catch {
      // Platform 413s and some proxy failures return HTML or an empty body.
    }
  }

  if (status >= 400) {
    return `${fallback} (${status})`;
  }

  return fallback;
}

export async function readApiError(
  response: Response,
  fallback = "Request failed",
): Promise<string> {
  const text = await response.text().catch(() => "");
  const message = parseApiError(response.status, text, fallback);
  const suffix = response.statusText?.trim();
  if (
    message === `${fallback} (${response.status})` &&
    suffix &&
    suffix !== "OK"
  ) {
    return `${fallback} (${response.status} ${suffix})`;
  }
  return message;
}

export async function callApi<T>(
  endpoint: string,
  body: Record<string, unknown> | FormData,
  onStatus?: (status: string) => void,
): Promise<T> {
  const isForm = body instanceof FormData;
  if (isForm && onStatus) {
    body.set("stream", "true");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    ...(isForm ? {} : { headers: { "Content-Type": "application/json" } }),
    body: isForm
      ? body
      : JSON.stringify({ ...body, stream: Boolean(onStatus) }),
  });

  if (!onStatus) {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(parseApiError(response.status, text));
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error("Unexpected response from server");
    }
  }

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = JSON.parse(line.slice(6)) as {
        status?: string;
        done?: boolean;
        result?: T;
        error?: string;
      };

      if (payload.status) onStatus(payload.status);
      if (payload.error) throw new Error(payload.error);
      if (payload.done && payload.result !== undefined) {
        result = payload.result;
      }
    }
  }

  if (result === undefined) {
    throw new Error("Stream ended without result");
  }

  return result;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
