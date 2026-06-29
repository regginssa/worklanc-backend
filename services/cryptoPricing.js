const { isStablecoin, getTokenDecimals } = require("../config/crypto");

const STABLECOIN_USD = { usdc: 1, usdt: 1 };

async function fetchNativePricesUsd() {
  try {
    const [ethRes, solRes, bnbRes] = await Promise.all([
      fetch("https://api.coinpaprika.com/v1/tickers/eth-ethereum?quotes=USD"),
      fetch("https://api.coinpaprika.com/v1/tickers/sol-solana?quotes=USD"),
      fetch(
        "https://api.coinpaprika.com/v1/tickers/bnb-binance-coin?quotes=USD"
      ),
    ]);

    const [eth, sol, bnb] = await Promise.all([
      ethRes.json(),
      solRes.json(),
      bnbRes.json(),
    ]);

    return {
      eth: Number(eth?.quotes?.USD?.price ?? 0),
      sol: Number(sol?.quotes?.USD?.price ?? 0),
      bnb: Number(bnb?.quotes?.USD?.price ?? 0),
    };
  } catch {
    return { eth: 0, sol: 0, bnb: 0 };
  }
}

async function fetchWorklancTokenPricesUsd() {
  const babyuTokenAddress = process.env.BABYU_TOKEN_ADDRESS;
  const chrleTokenAddress = process.env.CHRLE_TOKEN_ADDRESS;

  if (!babyuTokenAddress || !chrleTokenAddress) {
    return { babyu: 0, chrle: 0 };
  }

  try {
    const [babyuRes, chrleRes] = await Promise.all([
      fetch(`https://api-v3.raydium.io/mint/price?mints=${babyuTokenAddress}`),
      fetch(
        `https://launch-mint-v1.raydium.io/get/by/mints?ids=${chrleTokenAddress}`
      ),
    ]);

    const babyuJson = await babyuRes.json();
    const chrleJson = await chrleRes.json();

    const babyuUsd = Number(babyuJson?.data?.[babyuTokenAddress] ?? 0);
    const chrleRow = chrleJson?.data?.rows?.[0];
    let chrleUsd = 0;

    if (chrleRow?.marketCap && chrleRow?.supply) {
      chrleUsd = Number(chrleRow.marketCap) / Number(chrleRow.supply);
    }

    return {
      babyu: babyuUsd > 0 ? babyuUsd : 0,
      chrle: chrleUsd > 0 ? chrleUsd : 0,
    };
  } catch {
    return { babyu: 0, chrle: 0 };
  }
}

async function fetchTokenPricesUsd() {
  const [nativePrices, worklancPrices] = await Promise.all([
    fetchNativePricesUsd(),
    fetchWorklancTokenPricesUsd(),
  ]);

  return {
    ...STABLECOIN_USD,
    ...nativePrices,
    ...worklancPrices,
  };
}

function getDisplayDecimals(token, amount) {
  if (isStablecoin(token)) return 2;
  if (amount >= 1) return 4;
  if (amount >= 0.01) return 6;
  return 8;
}

function convertUsdCentsToCryptoAmount(totalCents, token, priceUsd) {
  if (!Number.isFinite(totalCents) || totalCents <= 0) {
    return { error: "Invalid checkout total." };
  }
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return {
      error:
        "Live token price is unavailable. Try again shortly or choose another token.",
    };
  }

  const usdAmount = totalCents / 100;
  const rawAmount = usdAmount / priceUsd;
  const decimals = getDisplayDecimals(token, rawAmount);
  const factor = 10 ** decimals;
  const rounded = Math.ceil(rawAmount * factor) / factor;
  const amount = rounded.toFixed(decimals);

  return {
    amount,
    priceUsd: String(priceUsd),
    decimals,
  };
}

function parseDecimalAmount(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function amountMeetsMinimum(received, expected, toleranceBps = 50) {
  if (!Number.isFinite(received) || !Number.isFinite(expected)) return false;
  const minimum = expected * (1 - toleranceBps / 10_000);
  return received + 1e-12 >= minimum;
}

function toAtomicUnits(amountStr, decimals) {
  const [whole, fraction = ""] = String(amountStr).split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return (
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0")
  );
}

module.exports = {
  fetchTokenPricesUsd,
  convertUsdCentsToCryptoAmount,
  parseDecimalAmount,
  amountMeetsMinimum,
  toAtomicUnits,
  getTokenDecimals,
};
