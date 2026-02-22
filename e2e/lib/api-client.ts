import type { CompileRequest, CompileResponse } from "./types.js";

export async function compileToken(
  apiUrl: string,
  request: CompileRequest,
): Promise<CompileResponse> {
  const resp = await fetch(`${apiUrl}/api/v1/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const err = await resp
      .json()
      .catch(() => ({ error: "Compilation failed" }));
    const errObj = err as { error?: string; details?: string };
    const msg = errObj.error ?? "Compilation failed";
    throw new Error(errObj.details ? `${msg}: ${errObj.details}` : msg);
  }

  return resp.json() as Promise<CompileResponse>;
}
