import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../lib/config.js";

describe("loadConfig", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env["API_URL"];
    delete process.env["IOTA_RPC_URL"];
    delete process.env["IOTA_FAUCET_URL"];
    delete process.env["IOTA_EXPLORER_URL"];
    delete process.env["PRIVATE_KEY"];
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("returns sensible testnet defaults when no env vars are set", () => {
    const cfg = loadConfig();
    expect(cfg.apiUrl).toBe("http://localhost:8090");
    expect(cfg.iotaRpcUrl).toBe("https://api.testnet.iota.cafe");
    expect(cfg.iotaFaucetUrl).toBe("https://faucet.testnet.iota.cafe");
    expect(cfg.iotaExplorerUrl).toBe("https://explorer.iota.org/testnet");
    expect(cfg.privateKey).toBeUndefined();
  });

  it("reads API_URL from environment", () => {
    process.env["API_URL"] = "http://myapi:9000";
    expect(loadConfig().apiUrl).toBe("http://myapi:9000");
  });

  it("reads PRIVATE_KEY from environment when set", () => {
    process.env["PRIVATE_KEY"] = "0xdeadbeef";
    expect(loadConfig().privateKey).toBe("0xdeadbeef");
  });

  it("returns undefined privateKey when PRIVATE_KEY is not set", () => {
    expect(loadConfig().privateKey).toBeUndefined();
  });
});
