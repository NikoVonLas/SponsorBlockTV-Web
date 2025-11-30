export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

const normalizeBaseUrl = (url: string | undefined) => {
  if (!url) {
    return "";
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
};

export const API_BASE_URL =
  normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL) || window.location.origin;

type ApiFetchOptions = RequestInit & {
  token?: string | null;
  skipAuthHeader?: boolean;
};

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { token, skipAuthHeader = false, headers, body, ...rest } = options;
  const target = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;

  const finalHeaders = new Headers(headers);
  if (!skipAuthHeader && token) {
    finalHeaders.set("Authorization", `Bearer ${token}`);
  }
  if (body && !(body instanceof FormData) && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(target, {
    ...rest,
    headers: finalHeaders,
    body:
      body && !(body instanceof FormData) && typeof body !== "string"
        ? JSON.stringify(body)
        : body,
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail?: unknown }).detail)
        : response.statusText) || "Request failed";
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}
