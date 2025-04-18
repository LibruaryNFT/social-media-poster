// config.js
require("dotenv").config();

module.exports = {
  /* ▸ Flow endpoints */
  FLOW_ACCESS_NODE: "https://mainnet.onflow.org", // No change
  FLOW_REST_ENDPOINT: "https://rest-mainnet.onflow.org", // No change

  /* ▸ USD thresholds */
  PRICE_THRESHOLD_OTHERS: 5, // Kept for fallback, adjust if needed
  PRICE_THRESHOLD_TOPSHOT: 100, // Kept for fallback, adjust if needed
  PRICE_THRESHOLD_TOPSHOT_PACKS: 30, // Kept for fallback, adjust if needed
  PRICE_THRESHOLD_NFL_PACKS: 30, // Kept for fallback, adjust if needed
  PRICE_THRESHOLD_HOTWHEELS: 1, // Kept for fallback, adjust if needed
  PRICE_THRESHOLD_PINNACLE: 25, // UPDATED: Specific threshold for the Pinnacle bot account
  PRICE_THRESHOLD_BIGSALES: 250, // NEW: Threshold for the Flow Sales Bot account

  /* ▸ Collection on/off switches */
  ENABLED_COLLECTIONS: [
    "TOPSHOT_MOMENT",
    "TOPSHOT_PACK",
    "NFL_PACK",
    "HOTWHEELS",
    "PINNACLE",
    "GENERIC_OTHER", // fallback handler
  ], // No change

  /* ▸ Twitter credentials */
  // App Credentials (used by both bots)
  TWITTER_API_KEY: process.env.TWITTER_API_KEY,
  TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,

  // Pinnacle Bot User Credentials (using your preferred names)
  PINNACLEPINBOT_ACCESS_TOKEN: process.env.PINNACLEPINBOT_ACCESS_TOKEN,
  PINNACLEPINBOT_ACCESS_SECRET: process.env.PINNACLEPINBOT_ACCESS_SECRET,

  // Flow Sales Bot User Credentials
  FLOWSALESBOT_ACCESS_TOKEN: process.env.FLOWSALESBOT_ACCESS_TOKEN,
  FLOWSALESBOT_ACCESS_SECRET: process.env.FLOWSALESBOT_ACCESS_SECRET,
};
