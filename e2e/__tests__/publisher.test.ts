import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getExplorerUrl,
  getOrCreateKeypair,
  fundFromFaucet,
  waitForBalance,
  publishPackage,
} from "../lib/publisher.js";

const mockRequestFaucet = vi.fn();
vi.mock("@iota/iota-sdk/faucet", () => ({
  requestIotaFromFaucetV0: (...args: unknown[]) => mockRequestFaucet(...args),
}));

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

const mockPublish = vi.fn(() => ["upgradeCap"]);
const mockTransferObjects = vi.fn();
vi.mock("@iota/iota-sdk/transactions", () => ({
  Transaction: vi.fn(() => ({
    publish: mockPublish,
    transferObjects: mockTransferObjects,
  })),
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

describe("fundFromFaucet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("calls requestIotaFromFaucetV0 with correct host and recipient", async () => {
    mockRequestFaucet.mockResolvedValueOnce(undefined);
    await fundFromFaucet("https://faucet.testnet.iota.cafe", "0xaddr1");
    expect(mockRequestFaucet).toHaveBeenCalledWith({
      host: "https://faucet.testnet.iota.cafe",
      recipient: "0xaddr1",
    });
  });

  it("retries with exponential backoff on faucet failure then succeeds", async () => {
    mockRequestFaucet
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce(undefined);
    await fundFromFaucet("https://faucet.test", "0xaddr", 3);
    expect(mockRequestFaucet).toHaveBeenCalledTimes(2);
  });

  it("falls back to HTTP POST when SDK faucet fails all retries", async () => {
    mockRequestFaucet.mockRejectedValue(new Error("SDK error"));
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await fundFromFaucet("https://faucet.test", "0xaddr", 1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://faucet.test/gas",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ FixedAmountRequest: { recipient: "0xaddr" } }),
      }),
    );
    mockFetch.mockRestore();
  });

  it("throws original error when both SDK and HTTP fallback fail", async () => {
    mockRequestFaucet.mockRejectedValue(new Error("SDK faucet down"));
    const mockFetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("HTTP fallback failed"));

    await expect(
      fundFromFaucet("https://faucet.test", "0xaddr", 1),
    ).rejects.toThrow("SDK faucet down");
    mockFetch.mockRestore();
  });
});

describe("waitForBalance", () => {
  it("resolves immediately when balance is available", async () => {
    const mockClient = {
      getBalance: vi.fn().mockResolvedValueOnce({ totalBalance: "1000000" }),
    };
    await waitForBalance(mockClient as any, "0xaddr", 3, 10);
    expect(mockClient.getBalance).toHaveBeenCalledTimes(1);
  });

  it("retries until balance appears", async () => {
    const mockClient = {
      getBalance: vi
        .fn()
        .mockResolvedValueOnce({ totalBalance: "0" })
        .mockResolvedValueOnce({ totalBalance: "0" })
        .mockResolvedValueOnce({ totalBalance: "500" }),
    };
    await waitForBalance(mockClient as any, "0xaddr", 5, 10);
    expect(mockClient.getBalance).toHaveBeenCalledTimes(3);
  });

  it("throws after max retries with no balance", async () => {
    const mockClient = {
      getBalance: vi.fn().mockResolvedValue({ totalBalance: "0" }),
    };
    await expect(
      waitForBalance(mockClient as any, "0xaddr", 2, 10),
    ).rejects.toThrow("No IOTA balance appeared");
  });
});

describe("publishPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds publish transaction, signs, waits, and returns digest", async () => {
    const mockClient = {
      signAndExecuteTransaction: vi
        .fn()
        .mockResolvedValueOnce({ digest: "0xdigest123" }),
      waitForTransaction: vi.fn().mockResolvedValueOnce(undefined),
    };
    const mockKeypair = {
      getPublicKey: () => ({ toIotaAddress: () => "0xsender" }),
    };
    const compiled = {
      modules: ["mod1"],
      dependencies: ["dep1"],
      digest: [1, 2, 3],
      packageName: "test",
    };

    const digest = await publishPackage(
      mockClient as any,
      mockKeypair as any,
      compiled,
    );

    expect(digest).toBe("0xdigest123");
    expect(mockPublish).toHaveBeenCalledWith({
      modules: ["mod1"],
      dependencies: ["dep1"],
    });
    expect(mockTransferObjects).toHaveBeenCalledWith(
      ["upgradeCap"],
      "0xsender",
    );
    expect(mockClient.signAndExecuteTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        signer: mockKeypair,
        options: { showEffects: true, showObjectChanges: true },
      }),
    );
    expect(mockClient.waitForTransaction).toHaveBeenCalledWith({
      digest: "0xdigest123",
    });
  });

  it("retries once on timeout error", async () => {
    const mockClient = {
      signAndExecuteTransaction: vi
        .fn()
        .mockRejectedValueOnce(new Error("Transaction timed out after 60s"))
        .mockResolvedValueOnce({ digest: "0xretry_digest" }),
      waitForTransaction: vi.fn().mockResolvedValue(undefined),
    };
    const mockKeypair = {
      getPublicKey: () => ({ toIotaAddress: () => "0xsender" }),
    };
    const compiled = {
      modules: ["mod1"],
      dependencies: ["dep1"],
      digest: [1],
      packageName: "test",
    };

    const digest = await publishPackage(
      mockClient as any,
      mockKeypair as any,
      compiled,
    );

    expect(digest).toBe("0xretry_digest");
    expect(mockClient.signAndExecuteTransaction).toHaveBeenCalledTimes(2);
  });

  it("throws non-timeout errors without retry", async () => {
    const mockClient = {
      signAndExecuteTransaction: vi
        .fn()
        .mockRejectedValueOnce(new Error("Insufficient gas")),
      waitForTransaction: vi.fn(),
    };
    const mockKeypair = {
      getPublicKey: () => ({ toIotaAddress: () => "0xsender" }),
    };
    const compiled = {
      modules: ["mod1"],
      dependencies: ["dep1"],
      digest: [1],
      packageName: "test",
    };

    await expect(
      publishPackage(mockClient as any, mockKeypair as any, compiled),
    ).rejects.toThrow("Insufficient gas");
    expect(mockClient.signAndExecuteTransaction).toHaveBeenCalledTimes(1);
  });
});
