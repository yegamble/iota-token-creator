import type { CompileRequest, CompileResponse } from "./types.js";

export async function compileToken(
  apiUrl: string,
  request: CompileRequest,
): Promise<CompileResponse> {
  const resp = await fetch(`${apiUrl}/api/v1/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!resp.ok) {
    const err = await resp
      .json()
      .catch(() => ({ error: "Compilation failed" }));
    throw new Error((err as { error?: string }).error ?? "Compilation failed");
  }

  return resp.json() as Promise<CompileResponse>;
}
