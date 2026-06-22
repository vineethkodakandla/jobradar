// ============================================================================
// Tiny typed fetch wrapper. Throws an Error (with the server message when JSON)
// on non-2xx so TanStack Query can surface it.
// ============================================================================

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    let msg = res.statusText || `Request failed (${res.status})`;
    if (data && typeof data === "object") {
      // Backend routes return { error } or { message }; surface either.
      if ("error" in data && (data as { error: unknown }).error != null) {
        msg = String((data as { error: unknown }).error);
      } else if ("message" in data && (data as { message: unknown }).message != null) {
        msg = String((data as { message: unknown }).message);
      }
    }
    throw new ApiError(res.status, msg, data);
  }

  return data as T;
}
