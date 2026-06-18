const UserNotificationSettings = require("../models/userNotificationSettings");
const { validatePatch } = require("../utils/notificationSettings");

const getMyNotificationSettings = async (req, res) => {
  try {
    const settings = await UserNotificationSettings.ensureDefaults(req.user.id);
    return res.status(200).json({ settings });
  } catch (e) {
    console.error("getMyNotificationSettings error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

const updateMyNotificationSettings = async (req, res) => {
  try {
    const patch = req.body?.settings ?? req.body;
    validatePatch(patch);
    const settings = await UserNotificationSettings.upsert(req.user.id, patch);
    return res.status(200).json({ settings });
  } catch (e) {
    if (
      e.message === "Invalid notification settings payload" ||
      e.message === "No notification settings provided" ||
      e.message.startsWith("Invalid value for") ||
      e.message.startsWith("Unknown notification setting:")
    ) {
      return res.status(400).json({ message: e.message });
    }
    console.error("updateMyNotificationSettings error: ", e);
    return res.status(500).json({ message: "Internal server error" });
  }
};

module.exports = {
  getMyNotificationSettings,
  updateMyNotificationSettings,
};
