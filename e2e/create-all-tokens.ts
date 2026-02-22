/**
 * IOTA Token Creator E2E Testnet Script
 *
 * Creates one token of each kind (Simple, CoinManager, Regulated) on the IOTA
 * testnet and prints the IOTA Explorer URL for each publish transaction.
 *
 * Prerequisites:
 *   docker compose -f ../iota-token-creator-api/docker-compose.yml up -d --wait
 *
 * Usage:
 *   pnpm e2e:testnet
 *   pnpm e2e:testnet:dotenv   # loads .env file automatically
 */

import { IotaClient } from "@iota/iota-sdk/client";
import { loadConfig } from "./lib/config.js";
import { compileToken } from "./lib/api-client.js";
import {
  getOrCreateKeypair,
  fundFromFaucet,
  waitForBalance,
  publishPackage,
  getExplorerUrl,
} from "./lib/publisher.js";
import type { CoinType } from "./lib/types.js";

async function checkApiHealth(
  apiUrl: string,
  maxRetries = 30,
  intervalMs = 2000,
): Promise<void> {
  console.log(`[health] Waiting for API at ${apiUrl}/healthz …`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(`${apiUrl}/healthz`);
      if (resp.ok) {
        console.log("[health] API is ready.");
        return;
      }
    } catch {}
    if (i < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  const totalSecs = (maxRetries * intervalMs) / 1000;
  console.error(
    `\n[error] API not available at ${apiUrl} after ${totalSecs}s.\n` +
      `Start it with:\n` +
      `  docker compose -f ../iota-token-creator-api/docker-compose.yml up -d --wait\n`,
  );
  process.exit(1);
}

function timeSuffix(): string {
  return `t${Date.now()}`;
}

interface TokenSpec {
  coinType: CoinType;
  name: string;
  symbol: string;
  description: string;
}

interface Result {
  coinType: CoinType;
  name: string;
  symbol: string;
  digest: string;
  explorerUrl: string;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const ts = timeSuffix();

  const tokens: TokenSpec[] = [
    {
      coinType: "simple",
      name: `E2ESimple${ts}`,
      symbol: "ESIM",
      description: "E2E testnet validation — Simple coin",
    },
    {
      coinType: "coinManager",
      name: `E2EManaged${ts}`,
      symbol: "EMGD",
      description: "E2E testnet validation — CoinManager coin",
    },
    {
      coinType: "regulated",
      name: `E2EReg${ts}`,
      symbol: "EREG",
      description: "E2E testnet validation — Regulated coin",
    },
  ];

  await checkApiHealth(cfg.apiUrl);

  const keypair = getOrCreateKeypair(cfg.privateKey);
  const address = keypair.getPublicKey().toIotaAddress();
  console.log(`\n[wallet] Address: ${address}`);

  const client = new IotaClient({ url: cfg.iotaRpcUrl });
  console.log(`[faucet] Requesting testnet IOTA from ${cfg.iotaFaucetUrl} …`);
  await fundFromFaucet(cfg.iotaFaucetUrl, address);

  console.log("[faucet] Waiting for balance …");
  await waitForBalance(client, address);
  const bal = await client.getBalance({ owner: address });
  console.log(`[faucet] Balance confirmed: ${bal.totalBalance} NANOS\n`);

  const results: Result[] = [];
  const failures: { coinType: CoinType; error: string }[] = [];

  for (const spec of tokens) {
    console.log(
      `[create] ${spec.coinType.toUpperCase()} — ${spec.name} (${spec.symbol})`,
    );
    try {
      process.stdout.write("         compile … ");
      const compiled = await compileToken(cfg.apiUrl, {
        coinType: spec.coinType,
        name: spec.name,
        symbol: spec.symbol,
        decimals: 6,
        description: spec.description,
        iconUrl: "",
        totalSupply: "1000000",
        maxSupply: "",
      });
      console.log(`ok (${compiled.modules.length} module(s))`);

      process.stdout.write("         publish … ");
      const digest = await publishPackage(client, keypair, compiled);
      const explorerUrl = getExplorerUrl(cfg.iotaExplorerUrl, digest);
      console.log(`ok`);
      console.log(`         🔗 ${explorerUrl}\n`);

      results.push({ ...spec, digest, explorerUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("compilation framework error")) {
        console.error(
          "\n[error] Move framework cache may be stale.\n" +
            "  Rebuild: docker compose build --no-cache api\n",
        );
      }
      console.error(`         FAILED: ${message}\n`);
      failures.push({ coinType: spec.coinType, error: message });
    }
  }

  console.log("═".repeat(80));
  console.log("SUMMARY");
  console.log("═".repeat(80));
  for (const r of results) {
    console.log(
      `✅ ${r.coinType.padEnd(14)} ${r.symbol.padEnd(6)} ${r.explorerUrl}`,
    );
  }
  for (const f of failures) {
    console.log(`❌ ${f.coinType.padEnd(14)} FAILED — ${f.error}`);
  }
  console.log("═".repeat(80));

  if (failures.length > 0) {
    console.error(`\n${failures.length} token(s) failed to create.`);
    process.exit(1);
  }

  console.log(
    `\n✅ All ${results.length} tokens created successfully on testnet.`,
  );
}

main().catch((err) => {
  console.error("[fatal]", err instanceof Error ? err.message : err);
  process.exit(1);
});
