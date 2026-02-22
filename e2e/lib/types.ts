export type CoinType = "simple" | "coinManager" | "regulated";

export interface CompileRequest {
  coinType: CoinType;
  name: string;
  symbol: string;
  decimals: number;
  description: string;
  iconUrl: string;
  totalSupply: string;
  maxSupply: string;
}

export interface CompileResponse {
  modules: string[];
  dependencies: string[];
  digest: number[];
  packageName: string;
}

export interface ApiError {
  error: string;
  details?: string;
}
