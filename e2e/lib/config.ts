export interface Config {
  apiUrl: string;
  iotaRpcUrl: string;
  iotaFaucetUrl: string;
  iotaExplorerUrl: string;
  privateKey: string | undefined;
}

export function loadConfig(): Config {
  return {
    apiUrl: process.env["API_URL"] ?? "http://localhost:8090",
    iotaRpcUrl: process.env["IOTA_RPC_URL"] ?? "https://api.testnet.iota.cafe",
    iotaFaucetUrl:
      process.env["IOTA_FAUCET_URL"] ?? "https://faucet.testnet.iota.cafe",
    iotaExplorerUrl:
      process.env["IOTA_EXPLORER_URL"] ?? "https://explorer.iota.org/testnet",
    privateKey: process.env["PRIVATE_KEY"],
  };
}
