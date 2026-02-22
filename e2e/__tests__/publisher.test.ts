import { describe, it, expect, vi, beforeEach } from "vitest";
import { getExplorerUrl, getOrCreateKeypair } from "../lib/publisher.js";

vi.mock("@iota/iota-sdk/keypairs/ed25519", () => ({
  Ed25519Keypair: {
    generate: vi.fn(() => ({
      getPublicKey: () => ({ toIotaAddress: () => "0xabc123" }),
      export: () => ({ privateKey: "0xdeadbeef" }),
    })),
    fromSecretKey: vi.fn((_key: Uint8Array) => ({
      getPublicKey: () => ({ toIotaAddress: () => "0xfromkey" }),
      export: () => ({ privateKey: "0xdeadbeef" }),
    })),
  },
}));

describe("getExplorerUrl", () => {
  it("constructs correct txblock URL", () => {
    const url = getExplorerUrl(
      "https://explorer.iota.org/testnet",
      "0xabc123digest",
    );
    expect(url).toBe(
      "https://explorer.iota.org/testnet/txblock/0xabc123digest",
    );
  });

  it("strips trailing slash from explorer base", () => {
    const url = getExplorerUrl(
      "https://explorer.iota.org/testnet/",
      "0xabc",
    );
    expect(url).toBe("https://explorer.iota.org/testnet/txblock/0xabc");
  });

  it("uses the exact digest returned by the network", () => {
    const digest = "HvxTg5K8RkRmfW3H4Lr1N2bXzPqY9mJ7cDsEaGuViop";
    const url = getExplorerUrl("https://explorer.iota.org/testnet", digest);
    expect(url).toContain(digest);
  });
});

describe("getOrCreateKeypair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env["PRIVATE_KEY"];
  });

  it("generates a new keypair when PRIVATE_KEY env var is not set", async () => {
    const { Ed25519Keypair } = await import(
      "@iota/iota-sdk/keypairs/ed25519"
    );
    const keypair = getOrCreateKeypair(undefined);
    expect(Ed25519Keypair.generate).toHaveBeenCalledOnce();
    expect(keypair).toBeDefined();
  });

  it("loads keypair from hex private key when PRIVATE_KEY is set", async () => {
    const { Ed25519Keypair } = await import(
      "@iota/iota-sdk/keypairs/ed25519"
    );
    const hexKey = "deadbeef".repeat(8);
    const keypair = getOrCreateKeypair(hexKey);
    expect(Ed25519Keypair.fromSecretKey).toHaveBeenCalledOnce();
    expect(keypair).toBeDefined();
  });
});
