const Users = require("../models/users");
const WithdrawalMethods = require("../models/withdrawalMethods");
const PayoneerService = require("../services/payoneer");

const VALID_CRYPTO_CHAINS = new Set(["solana", "ethereum", "bnb"]);
const VALID_SCHEDULES = new Set(["manual", "weekly", "monthly"]);

const getDefaultTokenForChain = (chain) => {
  switch (chain) {
    case "ethereum":
      return "eth";
    case "bnb":
      return "bnb";
    case "solana":
    default:
      return "usdc";
  }
};

const buildContextResponse = async (userId) => {
  const [settings, methods] = await Promise.all([
    WithdrawalMethods.getUserWithdrawalSettings(userId),
    WithdrawalMethods.listPublicByUserId(userId),
  ]);

  return {
    taxProfileComplete: settings?.tax_profile_complete ?? true,
    methods: {
      payoneer: methods.payoneer,
      cryptoWallets: methods.cryptoWallets,
      schedule: settings?.withdrawal_schedule ?? null,
    },
  };
};

const getContext = async (req, res) => {
  try {
    await refreshPayoneerStatus(req.user.id);
    const context = await buildContextResponse(req.user.id);
    return res.status(200).json(context);
  } catch (error) {
    console.error("getDisbursementContext error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const refreshPayoneerStatus = async (userId) => {
  const existing = await WithdrawalMethods.getPayoneerByUserId(userId);
  if (!existing?.payoneer_payee_id || !PayoneerService.isConfigured()) {
    return existing ? WithdrawalMethods.toPublicPayoneerRow(existing) : null;
  }

  try {
    const { status } = await PayoneerService.getPayeeStatus(
      existing.payoneer_payee_id,
    );
    if (status !== existing.payoneer_status) {
      return WithdrawalMethods.updatePayoneer(userId, { status });
    }
    return WithdrawalMethods.toPublicPayoneerRow(existing);
  } catch (error) {
    console.error("refreshPayoneerStatus error:", error);
    return WithdrawalMethods.toPublicPayoneerRow(existing);
  }
};

const registerPayoneer = async (req, res) => {
  try {
    const email = req.body?.email;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ message: "email is required" });
    }

    if (!PayoneerService.isConfigured()) {
      return res.status(503).json({
        message:
          "Payoneer is not configured. Set PAYONEER_CLIENT_ID, PAYONEER_CLIENT_SECRET, and PAYONEER_PROGRAM_ID.",
      });
    }

    const existing = await WithdrawalMethods.getPayoneerByUserId(req.user.id);
    if (existing) {
      return res.status(409).json({
        message: "You already have a Payoneer withdrawal method.",
        payoneer: WithdrawalMethods.toPublicPayoneerRow(existing),
      });
    }

    const user = await Users.getById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const registration = await PayoneerService.registerPayee({ user, email });
    const shouldBeDefault = !(await WithdrawalMethods.hasDefaultMethod(
      req.user.id,
    ));

    const payoneer = await WithdrawalMethods.createPayoneer({
      userId: req.user.id,
      payeeId: registration.payeeId,
      email: registration.email,
      registrationLink: registration.registrationLink,
      status: registration.status,
      isDefault: shouldBeDefault,
    });

    return res.status(201).json({
      payoneer,
      registrationLink: registration.registrationLink,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("registerPayoneer error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const refreshPayoneer = async (req, res) => {
  try {
    const payoneer = await refreshPayoneerStatus(req.user.id);
    if (!payoneer) {
      return res.status(404).json({ message: "Payoneer method not found" });
    }
    return res.status(200).json({ payoneer });
  } catch (error) {
    console.error("refreshPayoneer error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const deletePayoneer = async (req, res) => {
  try {
    const removed = await WithdrawalMethods.deletePayoneerByUserId(req.user.id);
    if (!removed) {
      return res.status(404).json({ message: "Payoneer method not found" });
    }

    if (removed.is_default) {
      const remaining = await WithdrawalMethods.listByUserId(req.user.id);
      const nextDefault = remaining[0];
      if (nextDefault?.type === "crypto") {
        await WithdrawalMethods.setDefaultCrypto(nextDefault.uid, req.user.id);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("deletePayoneer error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const saveCryptoWallet = async (req, res) => {
  try {
    const { address, chain, label, token } = req.body ?? {};

    if (!address || typeof address !== "string") {
      return res.status(400).json({ message: "address is required" });
    }
    if (!chain || !VALID_CRYPTO_CHAINS.has(chain)) {
      return res.status(400).json({ message: "Unsupported chain." });
    }

    const existing = await WithdrawalMethods.getCryptoByUserChain(
      req.user.id,
      chain,
    );
    if (existing) {
      return res.status(409).json({
        message: "You already have a withdrawal wallet for this network.",
      });
    }

    const shouldBeDefault = !(await WithdrawalMethods.hasDefaultMethod(
      req.user.id,
    ));

    const wallet = await WithdrawalMethods.createCrypto({
      userId: req.user.id,
      address: address.trim(),
      chain,
      token: token || getDefaultTokenForChain(chain),
      label: label?.trim() || null,
      isDefault: shouldBeDefault,
    });

    return res.status(201).json({ wallet });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "This wallet is already linked to another account.",
      });
    }
    console.error("saveCryptoWithdrawalWallet error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateCryptoWallet = async (req, res) => {
  try {
    const { uid } = req.params;
    const { address, label, token } = req.body ?? {};

    const existing = await WithdrawalMethods.getByUidAndUserId(
      uid,
      req.user.id,
    );
    if (!existing || existing.type !== "crypto") {
      return res.status(404).json({ message: "Withdrawal wallet not found" });
    }

    if (!address || typeof address !== "string") {
      return res.status(400).json({ message: "address is required" });
    }

    const wallet = await WithdrawalMethods.updateCrypto(uid, req.user.id, {
      address: address.trim(),
      label: label?.trim() || null,
      token,
    });

    return res.status(200).json({ wallet });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "This wallet is already linked to another account.",
      });
    }
    console.error("updateCryptoWithdrawalWallet error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const deleteCryptoWallet = async (req, res) => {
  try {
    const { uid } = req.params;
    const removed = await WithdrawalMethods.deleteCryptoByUidAndUserId(
      uid,
      req.user.id,
    );
    if (!removed) {
      return res.status(404).json({ message: "Withdrawal wallet not found" });
    }

    if (removed.is_default) {
      const payoneer = await WithdrawalMethods.getPayoneerByUserId(req.user.id);
      if (payoneer) {
        await WithdrawalMethods.setDefaultPayoneer(req.user.id);
      } else {
        const remaining = await WithdrawalMethods.listByUserId(req.user.id);
        const nextCrypto = remaining.find((row) => row.type === "crypto");
        if (nextCrypto) {
          await WithdrawalMethods.setDefaultCrypto(
            nextCrypto.uid,
            req.user.id,
          );
        }
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("deleteCryptoWithdrawalWallet error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const setDefaultMethod = async (req, res) => {
  try {
    const { type, uid } = req.body ?? {};

    if (type === "payoneer") {
      const payoneer = await WithdrawalMethods.setDefaultPayoneer(req.user.id);
      if (!payoneer) {
        return res.status(404).json({ message: "Payoneer method not found" });
      }
      return res.status(200).json({ payoneer });
    }

    if (type === "crypto") {
      if (!uid || typeof uid !== "string") {
        return res.status(400).json({ message: "uid is required for crypto" });
      }
      const wallet = await WithdrawalMethods.setDefaultCrypto(uid, req.user.id);
      if (!wallet) {
        return res.status(404).json({ message: "Withdrawal wallet not found" });
      }
      return res.status(200).json({ wallet });
    }

    return res.status(400).json({ message: "Invalid default method type." });
  } catch (error) {
    console.error("setDefaultWithdrawalMethod error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const { schedule } = req.body ?? {};

    if (schedule !== null && !VALID_SCHEDULES.has(schedule)) {
      return res.status(400).json({ message: "Invalid withdrawal schedule." });
    }

    const nextSchedule = await WithdrawalMethods.updateWithdrawalSchedule(
      req.user.id,
      schedule,
    );

    return res.status(200).json({ schedule: nextSchedule });
  } catch (error) {
    console.error("updateWithdrawalSchedule error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getContext,
  registerPayoneer,
  refreshPayoneer,
  deletePayoneer,
  saveCryptoWallet,
  updateCryptoWallet,
  deleteCryptoWallet,
  setDefaultMethod,
  updateSchedule,
  refreshPayoneerStatus,
};
