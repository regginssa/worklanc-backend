const pool = require("../config/db");

const CHECKOUT_TTL_DAYS = 7;

const toPublicCheckoutRow = (row) => ({
  uid: row.uid,
  connectAmount: row.connect_amount,
  subtotalCents: row.subtotal_cents,
  discountCents: row.discount_cents,
  totalCents: row.total_cents,
  promoCode: row.promo_code,
  status: row.status,
  paymentMethod: row.payment_method,
  savedPaymentMethodUid: row.saved_payment_method_uid,
  completedAt: row.completed_at,
  checkoutExpiresAt: row.expires_at,
  connectsExpireAt: row.connects_expire_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  cryptoPayment: row.crypto_chain
    ? {
        chain: row.crypto_chain,
        token: row.crypto_token,
        amount: row.crypto_amount,
        treasuryAddress: row.crypto_treasury_address,
        senderAddress: row.crypto_sender_address,
        tokenContract: row.crypto_token_contract,
        tokenPriceUsd: row.crypto_token_price_usd,
        quoteExpiresAt: row.crypto_quote_expires_at,
        txHash: row.crypto_tx_hash,
      }
    : null,
});

const expireStaleForUser = async (userId, client = pool) => {
  await client.query(
    `UPDATE connect_checkouts
     SET status = 'expired', updated_at = NOW()
     WHERE user_id = $1
       AND status = 'pending'
       AND expires_at < NOW()`,
    [userId],
  );
};

const findReusablePending = async (userId, bundleOptionId, promoCode, client = pool) => {
  const result = await client.query(
    `SELECT *
     FROM connect_checkouts
     WHERE user_id = $1
       AND bundle_option_id = $2
       AND status = 'pending'
       AND expires_at > NOW()
       AND COALESCE(LOWER(TRIM(promo_code)), '') = COALESCE(LOWER(TRIM($3::text)), '')
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, bundleOptionId, promoCode],
  );
  return result.rows[0] ?? null;
};

const createPending = async ({
  userId,
  bundleOptionId,
  connectAmount,
  subtotalCents,
  discountCents,
  totalCents,
  promoCode,
}) => {
  const result = await pool.query(
    `INSERT INTO connect_checkouts (
       user_id,
       bundle_option_id,
       connect_amount,
       subtotal_cents,
       discount_cents,
       total_cents,
       promo_code,
       status,
       expires_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW() + ($8 || ' days')::interval)
     RETURNING *`,
    [
      userId,
      bundleOptionId,
      connectAmount,
      subtotalCents,
      discountCents,
      totalCents,
      promoCode,
      String(CHECKOUT_TTL_DAYS),
    ],
  );
  return toPublicCheckoutRow(result.rows[0]);
};

const getByUidAndUserId = async (uid, userId) => {
  const result = await pool.query(
    `SELECT *
     FROM connect_checkouts
     WHERE uid = $1 AND user_id = $2`,
    [uid, userId],
  );
  return result.rows[0] ?? null;
};

const getPublicByUidAndUserId = async (uid, userId) => {
  const row = await getByUidAndUserId(uid, userId);
  return row ? toPublicCheckoutRow(row) : null;
};

const markProcessing = async (uid, userId, { paymentMethod, savedPaymentMethodUid }) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET status = 'processing',
         payment_method = $3,
         saved_payment_method_uid = $4,
         failure_message = NULL,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status IN ('pending', 'failed')
       AND expires_at > NOW()
     RETURNING *`,
    [uid, userId, paymentMethod, savedPaymentMethodUid],
  );
  return result.rows[0] ?? null;
};

const lockCryptoQuote = async (
  uid,
  userId,
  {
    savedPaymentMethodUid,
    cryptoChain,
    cryptoToken,
    cryptoAmount,
    cryptoTreasuryAddress,
    cryptoSenderAddress,
    cryptoTokenContract,
    cryptoTokenPriceUsd,
    quoteExpiresAt,
  },
) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET status = 'processing',
         payment_method = 'crypto',
         saved_payment_method_uid = $3,
         crypto_chain = $4,
         crypto_token = $5,
         crypto_amount = $6,
         crypto_treasury_address = $7,
         crypto_sender_address = $8,
         crypto_token_contract = $9,
         crypto_token_price_usd = $10,
         crypto_quote_expires_at = $11,
         crypto_tx_hash = NULL,
         failure_message = NULL,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status IN ('pending', 'failed', 'processing')
       AND expires_at > NOW()
     RETURNING *`,
    [
      uid,
      userId,
      savedPaymentMethodUid,
      cryptoChain,
      cryptoToken,
      cryptoAmount,
      cryptoTreasuryAddress,
      cryptoSenderAddress,
      cryptoTokenContract,
      cryptoTokenPriceUsd,
      quoteExpiresAt,
    ],
  );
  return result.rows[0] ?? null;
};

const getByCryptoTxHash = async (txHash) => {
  const result = await pool.query(
    `SELECT * FROM connect_checkouts WHERE crypto_tx_hash = $1`,
    [txHash],
  );
  return result.rows[0] ?? null;
};

const markCompleted = async (uid, userId, stripePaymentIntentId) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET status = 'completed',
         stripe_payment_intent_id = $3,
         completed_at = NOW(),
         connects_expire_at = NOW() + INTERVAL '1 year',
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status = 'processing'
     RETURNING *`,
    [uid, userId, stripePaymentIntentId],
  );
  return result.rows[0] ?? null;
};

const completeAndCreditConnects = async (
  uid,
  userId,
  paymentReference,
  connectAmount,
) => {
  const stripePaymentIntentId = paymentReference?.stripePaymentIntentId ?? null;
  const cryptoTxHash = paymentReference?.cryptoTxHash ?? null;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const checkoutResult = await client.query(
      `UPDATE connect_checkouts
       SET status = 'completed',
           stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
           crypto_tx_hash = COALESCE($4, crypto_tx_hash),
           completed_at = NOW(),
           connects_expire_at = NOW() + INTERVAL '1 year',
           connects_credited = TRUE,
           updated_at = NOW()
       WHERE uid = $1
         AND user_id = $2
         AND status = 'processing'
         AND connects_credited = FALSE
       RETURNING *`,
      [uid, userId, stripePaymentIntentId, cryptoTxHash],
    );

    let checkoutRow = checkoutResult.rows[0] ?? null;

    if (!checkoutRow) {
      const existing = await client.query(
        `SELECT *
         FROM connect_checkouts
         WHERE uid = $1 AND user_id = $2`,
        [uid, userId],
      );
      checkoutRow = existing.rows[0] ?? null;

      if (
        checkoutRow?.status === "completed" &&
        checkoutRow.connects_credited === false
      ) {
        const creditResult = await client.query(
          `UPDATE users
           SET connects_balance = COALESCE(connects_balance, 0) + $2
           WHERE id = $1
           RETURNING connects_balance`,
          [userId, connectAmount],
        );

        await client.query(
          `UPDATE connect_checkouts
           SET connects_credited = TRUE, updated_at = NOW()
           WHERE uid = $1 AND user_id = $2`,
          [uid, userId],
        );

        await client.query("COMMIT");

        return {
          checkout: checkoutRow,
          connectsBalance: creditResult.rows[0]?.connects_balance ?? 0,
        };
      }

      await client.query("COMMIT");

      if (checkoutRow?.status === "completed") {
        const balanceResult = await client.query(
          `SELECT connects_balance FROM users WHERE id = $1`,
          [userId],
        );
        return {
          checkout: checkoutRow,
          connectsBalance: balanceResult.rows[0]?.connects_balance ?? 0,
        };
      }

      return null;
    }

    const balanceResult = await client.query(
      `UPDATE users
       SET connects_balance = COALESCE(connects_balance, 0) + $2
       WHERE id = $1
       RETURNING connects_balance`,
      [userId, connectAmount],
    );

    await client.query("COMMIT");

    return {
      checkout: checkoutRow,
      connectsBalance: balanceResult.rows[0]?.connects_balance ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const updatePromoAndPricing = async (
  uid,
  userId,
  { promoCode, subtotalCents, discountCents, totalCents },
) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET promo_code = $3,
         subtotal_cents = $4,
         discount_cents = $5,
         total_cents = $6,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status IN ('pending', 'failed')
       AND expires_at > NOW()
     RETURNING *`,
    [uid, userId, promoCode, subtotalCents, discountCents, totalCents],
  );
  return result.rows[0] ?? null;
};

const syncPricing = async (
  uid,
  userId,
  { subtotalCents, discountCents, totalCents },
) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET subtotal_cents = $3,
         discount_cents = $4,
         total_cents = $5,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status IN ('pending', 'failed', 'processing')
     RETURNING *`,
    [uid, userId, subtotalCents, discountCents, totalCents],
  );
  return result.rows[0] ?? null;
};

const markFailed = async (uid, userId, failureMessage) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET status = 'failed',
         failure_message = $3,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status IN ('pending', 'processing')
     RETURNING *`,
    [uid, userId, failureMessage],
  );
  return result.rows[0] ?? null;
};

const resetToPending = async (uid, userId) => {
  const result = await pool.query(
    `UPDATE connect_checkouts
     SET status = 'pending',
         payment_method = NULL,
         saved_payment_method_uid = NULL,
         crypto_chain = NULL,
         crypto_token = NULL,
         crypto_amount = NULL,
         crypto_treasury_address = NULL,
         crypto_sender_address = NULL,
         crypto_token_contract = NULL,
         crypto_token_price_usd = NULL,
         crypto_quote_expires_at = NULL,
         crypto_tx_hash = NULL,
         failure_message = NULL,
         updated_at = NOW()
     WHERE uid = $1
       AND user_id = $2
       AND status = 'processing'
     RETURNING *`,
    [uid, userId],
  );
  return result.rows[0] ?? null;
};

const HISTORY_DATE_RANGES = {
  "last-7-days": 7,
  "last-30-days": 30,
  "last-90-days": 90,
};

const toPublicHistoryRow = (row) => ({
  uid: row.uid,
  connectAmount: row.connect_amount,
  totalCents: row.total_cents,
  discountCents: row.discount_cents,
  promoCode: row.promo_code,
  status: row.status,
  paymentMethod: row.payment_method,
  completedAt: row.completed_at,
  connectsExpireAt: row.connects_expire_at,
  createdAt: row.created_at,
  cryptoToken: row.crypto_token,
  cryptoAmount: row.crypto_amount,
  cryptoTxHash: row.crypto_tx_hash,
});

const listUserHistory = async (
  userId,
  { search = "", dateRange = "last-30-days" } = {},
) => {
  const days = HISTORY_DATE_RANGES[dateRange] ?? 30;
  const trimmedSearch = String(search ?? "")
    .trim()
    .replace(/^\$/, "");
  const searchPattern = trimmedSearch ? `%${trimmedSearch}%` : null;

  const params = [userId, days];
  let searchClause = "";

  if (searchPattern) {
    params.push(searchPattern);
    const searchIndex = params.length;
    searchClause = `AND (
      uid ILIKE $${searchIndex}
      OR CAST(connect_amount AS TEXT) ILIKE $${searchIndex}
      OR CAST(total_cents AS TEXT) ILIKE $${searchIndex}
      OR (total_cents::numeric / 100)::text ILIKE $${searchIndex}
      OR COALESCE(promo_code, '') ILIKE $${searchIndex}
      OR COALESCE(payment_method, '') ILIKE $${searchIndex}
      OR COALESCE(
        CASE payment_method
          WHEN 'card' THEN 'credit card'
          WHEN 'paypal' THEN 'paypal'
          WHEN 'crypto' THEN 'crypto'
          ELSE payment_method
        END,
        ''
      ) ILIKE $${searchIndex}
      OR COALESCE(crypto_token, '') ILIKE $${searchIndex}
      OR COALESCE(crypto_amount, '') ILIKE $${searchIndex}
      OR COALESCE(crypto_tx_hash, '') ILIKE $${searchIndex}
    )`;
  }

  const result = await pool.query(
    `SELECT
       uid,
       connect_amount,
       total_cents,
       discount_cents,
       promo_code,
       status,
       payment_method,
       completed_at,
       connects_expire_at,
       created_at,
       crypto_token,
       crypto_amount,
       crypto_tx_hash
     FROM connect_checkouts
     WHERE user_id = $1
       AND status = 'completed'
       AND completed_at IS NOT NULL
       AND completed_at >= NOW() - ($2 || ' days')::interval
       ${searchClause}
     ORDER BY completed_at DESC`,
    params,
  );

  return result.rows.map(toPublicHistoryRow);
};

module.exports = {
  CHECKOUT_TTL_DAYS,
  toPublicCheckoutRow,
  toPublicHistoryRow,
  expireStaleForUser,
  findReusablePending,
  createPending,
  getByUidAndUserId,
  getPublicByUidAndUserId,
  markProcessing,
  lockCryptoQuote,
  getByCryptoTxHash,
  markCompleted,
  completeAndCreditConnects,
  markFailed,
  resetToPending,
  updatePromoAndPricing,
  syncPricing,
  listUserHistory,
};
