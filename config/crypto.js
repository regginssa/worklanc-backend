/**
 * Crypto token + treasury configuration for Connect checkout payments.
 * Worklanc uses a non-custodial model: users pay directly from their wallet
 * to a Worklanc treasury address; we never hold user funds in platform wallets.
 */

const SUPPORTED_CHAINS = new Set(["solana", "ethereum", "bnb"]);

const SUPPORTED_TOKENS = new Set([
  "chrle",
  "babyu",
  "sol",
  "eth",
  "bnb",
  "usdc",
  "usdt",
]);

const TOKEN_DECIMALS = {
  chrle: 9,
  babyu: 9,
  sol: 9,
  eth: 18,
  bnb: 18,
  usdc: 6,
  usdt: 6,
};

const NATIVE_TOKENS = new Set(["sol", "eth", "bnb"]);

const STABLECOIN_TOKENS = new Set(["usdc", "usdt"]);

const TOKEN_CHAIN_MAP = {
  chrle: "solana",
  babyu: "solana",
  sol: "solana",
  eth: "ethereum",
  bnb: "bnb",
};

const getTokenContract = (chain, token) => {
  const envKey = `CRYPTO_${token.toUpperCase()}_${chain.toUpperCase()}_CONTRACT`;
  if (process.env[envKey]) return process.env[envKey];

  const defaults = {
    solana: {
      chrle: process.env.CHRLE_TOKEN_ADDRESS,
      babyu: process.env.BABYU_TOKEN_ADDRESS,
      usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      usdt: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    },
    ethereum: {
      usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    },
    bnb: {
      usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      usdt: "0x55d398326f99059fF775485246999027B3197955",
    },
  };

  return defaults[chain]?.[token] ?? null;
};

const getTreasuryAddress = (chain) => {
  const envKey = `WORKLANC_TREASURY_${chain.toUpperCase()}`;
  return process.env[envKey] ?? null;
};

const getRpcUrl = (chain) => {
  const envKey = `CRYPTO_RPC_${chain.toUpperCase()}`;
  if (process.env[envKey]) return process.env[envKey];

  const useTestnets = process.env.CRYPTO_USE_TESTNETS === "true";

  if (chain === "solana") {
    return useTestnets
      ? "https://api.devnet.solana.com"
      : "https://api.mainnet-beta.solana.com";
  }

  if (chain === "ethereum") {
    return useTestnets ? "https://rpc.sepolia.org" : "https://ethereum-rpc.publicnode.com";
  }

  if (chain === "bnb") {
    return useTestnets
      ? "https://data-seed-prebsc-1-s1.binance.org:8545"
      : "https://bsc-dataseed.binance.org";
  }

  return null;
};

const getEvmChainId = (chain) => {
  const useTestnets = process.env.CRYPTO_USE_TESTNETS === "true";
  if (chain === "ethereum") return useTestnets ? 11155111 : 1;
  if (chain === "bnb") return useTestnets ? 97 : 56;
  return null;
};

const isNativeToken = (token) => NATIVE_TOKENS.has(token);

const isStablecoin = (token) => STABLECOIN_TOKENS.has(token);

const getTokenDecimals = (token) => TOKEN_DECIMALS[token] ?? 18;

const assertTokenOnChain = (chain, token) => {
  if (!SUPPORTED_CHAINS.has(chain)) {
    return { error: "Unsupported blockchain network." };
  }
  if (!SUPPORTED_TOKENS.has(token)) {
    return { error: "Unsupported crypto token." };
  }

  const expectedChain = TOKEN_CHAIN_MAP[token];
  if (expectedChain && expectedChain !== chain) {
    return { error: `${token.toUpperCase()} is not available on ${chain}.` };
  }

  const contract = getTokenContract(chain, token);
  if (!isNativeToken(token) && !contract) {
    return { error: `Token contract is not configured for ${token} on ${chain}.` };
  }

  const treasury = getTreasuryAddress(chain);
  if (!treasury) {
    return { error: `Treasury wallet is not configured for ${chain}.` };
  }

  return {
    chain,
    token,
    contract: isNativeToken(token) ? null : contract,
    treasury,
    decimals: getTokenDecimals(token),
    isNative: isNativeToken(token),
    isStablecoin: isStablecoin(token),
  };
};

module.exports = {
  SUPPORTED_CHAINS,
  SUPPORTED_TOKENS,
  CRYPTO_QUOTE_TTL_MINUTES: 15,
  PAYMENT_TOLERANCE_BPS: 50, // 0.5% underpayment tolerance
  getTokenContract,
  getTreasuryAddress,
  getRpcUrl,
  getEvmChainId,
  isNativeToken,
  isStablecoin,
  getTokenDecimals,
  assertTokenOnChain,
};
