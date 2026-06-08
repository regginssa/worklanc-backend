const GEOAPIFY_BASE = "https://api.geoapify.com/v1/geocode/autocomplete";

const buildStreetAddress = (props) => {
  if (props.address_line1) return props.address_line1;
  const parts = [props.housenumber, props.street].filter(Boolean);
  return parts.join(" ").trim();
};

const toSuggestion = (feature) => {
  const props = feature.properties || {};

  return {
    placeId: props.place_id || feature.properties?.place_id || props.osm_id || props.formatted,
    label: props.formatted || props.address_line1 || "",
    streetAddress: buildStreetAddress(props),
    city: props.city || props.town || props.village || props.municipality || "",
    state: props.state || props.state_code || "",
    country: props.country || "",
    countryCode: (props.country_code || "").toUpperCase(),
    zip: props.postcode || "",
  };
};

async function searchAddresses({ text, countryCode, limit = 8 }) {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    throw new Error("GEOAPIFY_API_KEY is not configured");
  }

  const query = text.trim();
  if (query.length < 3) {
    return [];
  }

  const params = new URLSearchParams({
    text: query,
    format: "geojson",
    limit: String(limit),
    apiKey,
  });

  if (countryCode) {
    params.set("filter", `countrycode:${countryCode.toLowerCase()}`);
  }

  const response = await fetch(`${GEOAPIFY_BASE}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Geoapify request failed (${response.status})`);
  }

  const data = await response.json();
  const features = data.features || [];

  return features
    .map(toSuggestion)
    .filter((item) => item.label && item.streetAddress);
}

module.exports = { searchAddresses };
