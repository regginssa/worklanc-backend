const {
  getRpcUrl,
  getEvmChainId,
  isNativeToken,
  getTokenDecimals,
  PAYMENT_TOLERANCE_BPS,
} = require("../config/crypto");
const {
  parseDecimalAmount,
  amountMeetsMinimum,
  toAtomicUnits,
} = require("./cryptoPricing");

const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const normalizeAddress = (value) => String(value ?? "").toLowerCase();

const normalizeSolanaAddress = (value) => String(value ?? "");

async function rpcCall(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message || "RPC request failed.");
  }
  return json.result;
}

function padAddressTopic(address) {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

async function verifyEvmPayment({
  chain,
  txHash,
  treasuryAddress,
  senderAddress,
  token,
  tokenContract,
  expectedAmount,
}) {
  const rpcUrl = getRpcUrl(chain);
  const chainId = getEvmChainId(chain);

  if (!rpcUrl || !chainId) {
    return { ok: false, error: "EVM RPC is not configured." };
  }

  const receipt = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) {
    return { ok: false, pending: true, error: "Transaction not found yet." };
  }

  if (receipt.status && receipt.status !== "0x1") {
    return { ok: false, error: "Transaction failed on-chain." };
  }

  const tx = await rpcCall(rpcUrl, "eth_getTransactionByHash", [txHash]);
  if (!tx) {
    return { ok: false, error: "Transaction details unavailable." };
  }

  const from = normalizeAddress(tx.from);
  if (normalizeAddress(senderAddress) !== from) {
    return { ok: false, error: "Payment was not sent from the selected wallet." };
  }

  const expected = parseDecimalAmount(expectedAmount);
  if (expected === null) {
    return { ok: false, error: "Invalid expected payment amount." };
  }

  if (isNativeToken(token)) {
    const valueWei = BigInt(tx.value);
    const expectedWei = toAtomicUnits(expectedAmount, getTokenDecimals(token));

    if (normalizeAddress(tx.to) !== normalizeAddress(treasuryAddress)) {
      return { ok: false, error: "Payment was not sent to the Worklanc treasury." };
    }

    const received = Number(valueWei) / 10 ** getTokenDecimals(token);
    if (!amountMeetsMinimum(received, expected, PAYMENT_TOLERANCE_BPS)) {
      return { ok: false, error: "Payment amount is lower than quoted." };
    }

    return { ok: true, receivedAmount: String(received) };
  }

  const treasuryTopic = padAddressTopic(treasuryAddress);
  const transferLog = (receipt.logs ?? []).find((log) => {
    if (normalizeAddress(log.address) !== normalizeAddress(tokenContract)) {
      return false;
    }
    const topics = log.topics ?? [];
    return (
      topics[0] === ERC20_TRANSFER_TOPIC &&
      topics[2] === treasuryTopic
    );
  });

  if (!transferLog) {
    return { ok: false, error: "Token transfer to treasury was not found." };
  }

  const amountWei = BigInt(transferLog.data);
  const decimals = getTokenDecimals(token);
  const received = Number(amountWei) / 10 ** decimals;

  if (!amountMeetsMinimum(received, expected, PAYMENT_TOLERANCE_BPS)) {
    return { ok: false, error: "Payment amount is lower than quoted." };
  }

  return { ok: true, receivedAmount: String(received) };
}

async function verifySolanaPayment({
  txHash,
  treasuryAddress,
  senderAddress,
  token,
  tokenContract,
  expectedAmount,
}) {
  const rpcUrl = getRpcUrl("solana");
  if (!rpcUrl) {
    return { ok: false, error: "Solana RPC is not configured." };
  }

  const result = await rpcCall(rpcUrl, "getTransaction", [
    txHash,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);

  if (!result) {
    return { ok: false, pending: true, error: "Transaction not found yet." };
  }

  if (result.meta?.err) {
    return { ok: false, error: "Transaction failed on-chain." };
  }

  const accountKeys = (result.transaction?.message?.accountKeys ?? []).map(
    (key) => (typeof key === "string" ? key : key.pubkey),
  );

  const senderIndex = accountKeys.findIndex(
    (key) => normalizeSolanaAddress(key) === normalizeSolanaAddress(senderAddress),
  );

  if (senderIndex < 0) {
    return { ok: false, error: "Selected wallet did not sign this transaction." };
  }

  const expected = parseDecimalAmount(expectedAmount);
  if (expected === null) {
    return { ok: false, error: "Invalid expected payment amount." };
  }

  if (!isNativeToken(token)) {
    const preByOwnerMint = new Map();
    for (const bal of result.meta?.preTokenBalances ?? []) {
      const key = `${normalizeSolanaAddress(bal.owner)}:${normalizeSolanaAddress(bal.mint)}`;
      const amount = Number(bal.uiTokenAmount?.uiAmount ?? 0);
      preByOwnerMint.set(key, (preByOwnerMint.get(key) ?? 0) + amount);
    }

    let received = 0;
    for (const bal of result.meta?.postTokenBalances ?? []) {
      const owner = normalizeSolanaAddress(bal.owner);
      const mint = normalizeSolanaAddress(bal.mint);
      if (
        owner !== normalizeSolanaAddress(treasuryAddress) ||
        mint !== normalizeSolanaAddress(tokenContract)
      ) {
        continue;
      }

      const key = `${owner}:${mint}`;
      const after = Number(bal.uiTokenAmount?.uiAmount ?? 0);
      const before = preByOwnerMint.get(key) ?? 0;
      received += after - before;
      preByOwnerMint.set(key, after);
    }

    if (received <= 0) {
      return { ok: false, error: "SPL token transfer to treasury was not found." };
    }

    if (!amountMeetsMinimum(received, expected, PAYMENT_TOLERANCE_BPS)) {
      return { ok: false, error: "Payment amount is lower than quoted." };
    }

    return { ok: true, receivedAmount: String(received) };
  }

  const instructions = result.transaction?.message?.instructions ?? [];
  const innerInstructions = (result.meta?.innerInstructions ?? []).flatMap(
    (group) => group.instructions ?? [],
  );
  const allInstructions = [...instructions, ...innerInstructions];

  if (isNativeToken(token)) {
    const transferIx = allInstructions.find((ix) => {
      const parsed = ix.parsed;
      return (
        parsed?.type === "transfer" &&
        normalizeSolanaAddress(parsed?.info?.source) ===
          normalizeSolanaAddress(senderAddress) &&
        normalizeSolanaAddress(parsed?.info?.destination) ===
          normalizeSolanaAddress(treasuryAddress)
      );
    });

    if (!transferIx) {
      return { ok: false, error: "SOL transfer to treasury was not found." };
    }

    const lamports = Number(transferIx.parsed?.info?.lamports ?? 0);
    const received = lamports / 10 ** getTokenDecimals(token);

    if (!amountMeetsMinimum(received, expected, PAYMENT_TOLERANCE_BPS)) {
      return { ok: false, error: "Payment amount is lower than quoted." };
    }

    return { ok: true, receivedAmount: String(received) };
  }

  return { ok: false, error: "Unsupported token type for Solana verification." };
}

async function verifyCryptoPayment({
  chain,
  txHash,
  treasuryAddress,
  senderAddress,
  token,
  tokenContract,
  expectedAmount,
}) {
  if (chain === "solana") {
    return verifySolanaPayment({
      txHash,
      treasuryAddress,
      senderAddress,
      token,
      tokenContract,
      expectedAmount,
    });
  }

  if (chain === "ethereum" || chain === "bnb") {
    return verifyEvmPayment({
      chain,
      txHash,
      treasuryAddress,
      senderAddress,
      token,
      tokenContract,
      expectedAmount,
    });
  }

  return { ok: false, error: "Unsupported blockchain network." };
}

module.exports = {
  verifyCryptoPayment,
};
