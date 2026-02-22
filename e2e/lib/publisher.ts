import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { IotaClient } from "@iota/iota-sdk/client";
import { Transaction } from "@iota/iota-sdk/transactions";
import { requestIotaFromFaucetV0 } from "@iota/iota-sdk/faucet";
import type { CompileResponse } from "./types.js";

export type Keypair = InstanceType<typeof Ed25519Keypair>;

export function getOrCreateKeypair(privateKeyHex: string | undefined): Keypair {
  if (privateKeyHex) {
    const hex = privateKeyHex.startsWith("0x")
      ? privateKeyHex.slice(2)
      : privateKeyHex;
    const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
    return Ed25519Keypair.fromSecretKey(bytes);
  }
  return Ed25519Keypair.generate();
}

export function getExplorerUrl(explorerBase: string, digest: string): string {
  const base = explorerBase.endsWith("/")
    ? explorerBase.slice(0, -1)
    : explorerBase;
  return `${base}/txblock/${digest}`;
}

export async function fundFromFaucet(
  faucetUrl: string,
  address: string,
  maxRetries = 3,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await requestIotaFromFaucetV0({ host: faucetUrl, recipient: address });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        const delayMs = 2000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  try {
    const resp = await fetch(`${faucetUrl}/gas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) {
      throw new Error(`Faucet HTTP fallback returned ${resp.status}`);
    }
  } catch (fallbackErr) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

export async function waitForBalance(
  client: IotaClient,
  address: string,
  maxRetries = 10,
  intervalMs = 3000,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    const balance = await client.getBalance({ owner: address });
    if (BigInt(balance.totalBalance) > 0n) return;
    if (i < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  throw new Error(
    `No IOTA balance appeared after ${(maxRetries * intervalMs) / 1000}s. ` +
      `Check that the faucet funded address ${address} correctly.`,
  );
}

async function executePublish(
  client: IotaClient,
  keypair: Keypair,
  compiled: CompileResponse,
): Promise<string> {
  const address = keypair.getPublicKey().toIotaAddress();

  const tx = new Transaction();
  const [upgradeCap] = tx.publish({
    modules: compiled.modules,
    dependencies: compiled.dependencies,
  });
  tx.transferObjects([upgradeCap], address);

  const result = await Promise.race([
    client.signAndExecuteTransaction({
      transaction: tx,
      signer: keypair,
      options: { showEffects: true, showObjectChanges: true },
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Transaction timed out after 60s")),
        60_000,
      ),
    ),
  ]);

  await client.waitForTransaction({ digest: result.digest });

  return result.digest;
}

export async function publishPackage(
  client: IotaClient,
  keypair: Keypair,
  compiled: CompileResponse,
): Promise<string> {
  try {
    return await executePublish(client, keypair, compiled);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timed out")) {
      return await executePublish(client, keypair, compiled);
    }
    throw err;
  }
}
