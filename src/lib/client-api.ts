export async function callApi<T>(
  endpoint: string,
  body: Record<string, unknown>,
  onStatus?: (status: string) => void,
): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: Boolean(onStatus) }),
  });

  if (!onStatus) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Request failed");
    }
    return data as T;
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "Request failed");
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
