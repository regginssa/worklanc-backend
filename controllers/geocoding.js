const { searchAddresses } = require("../services/geocoding/geoapify");

// GET /geocoding/autocomplete?text=...&countryCode=US
const autocomplete = async (req, res) => {
  try {
    const text = String(req.query.text || "");
    const countryCode = req.query.countryCode
      ? String(req.query.countryCode)
      : undefined;

    const suggestions = await searchAddresses({ text, countryCode });
    return res.status(200).json({ suggestions });
  } catch (e) {
    console.error("geocoding autocomplete error:", e);
    return res.status(500).json({ message: "Address lookup failed" });
  }
};

module.exports = { autocomplete };
