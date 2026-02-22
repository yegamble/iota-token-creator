import { describe, it, expect, vi, beforeEach } from "vitest";
import { compileToken } from "../lib/api-client.js";
import type { CompileRequest, CompileResponse } from "../lib/types.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const API_URL = "http://localhost:8090";

const validRequest: CompileRequest = {
  coinType: "simple",
  name: "Test Token",
  symbol: "TTK",
  decimals: 6,
  description: "A test token",
  iconUrl: "",
  totalSupply: "1000000",
  maxSupply: "",
};

const validResponse: CompileResponse = {
  modules: ["AQID"],
  dependencies: ["0x0000000000000000000000000000000000000000000000000000000000000001"],
  digest: [1, 2, 3],
  packageName: "test_token",
};

describe("compileToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends POST to /api/v1/compile with correct JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validResponse,
    });

    await compileToken(API_URL, validRequest);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`${API_URL}/api/v1/compile`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(validRequest);
  });

  it("returns parsed CompileResponse on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validResponse,
    });

    const result = await compileToken(API_URL, validRequest);

    expect(result.modules).toEqual(["AQID"]);
    expect(result.dependencies).toHaveLength(1);
    expect(result.digest).toEqual([1, 2, 3]);
    expect(result.packageName).toBe("test_token");
  });

  it("throws with API error message on 4xx response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid request body", details: "missing name" }),
    });

    await expect(compileToken(API_URL, validRequest)).rejects.toThrow("invalid request body");
  });

  it("throws with API error message on 422 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: "compilation failed", details: "unknown type" }),
    });

    await expect(compileToken(API_URL, validRequest)).rejects.toThrow("compilation failed");
  });

  it("throws generic error when response body is not JSON", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error("not json"); },
    });

    await expect(compileToken(API_URL, validRequest)).rejects.toThrow("Compilation failed");
  });

  it("works for all three coin types", async () => {
    const coinTypes = ["simple", "coinManager", "regulated"] as const;

    for (const coinType of coinTypes) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...validResponse, packageName: coinType }),
      });

      const result = await compileToken(API_URL, { ...validRequest, coinType });
      expect(result.packageName).toBe(coinType);

      const body = JSON.parse(mockFetch.mock.calls.at(-1)![1].body);
      expect(body.coinType).toBe(coinType);
    }
  });
});
