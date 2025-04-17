require("dotenv").config();

module.exports = {
  /* ▸ Flow endpoints */
  FLOW_ACCESS_NODE: "https://mainnet.onflow.org",
  FLOW_REST_ENDPOINT: "https://rest-mainnet.onflow.org",

  /* ▸ USD thresholds */
  PRICE_THRESHOLD_OTHERS: 5,
  PRICE_THRESHOLD_TOPSHOT: 100, // moments
  PRICE_THRESHOLD_TOPSHOT_PACKS: 30,
  PRICE_THRESHOLD_NFL_PACKS: 30,
  PRICE_THRESHOLD_HOTWHEELS: 1,
  PRICE_THRESHOLD_PINNACLE: 1,

  /* ▸ Collection on/off switches */
  ENABLED_COLLECTIONS: [
    "TOPSHOT_MOMENT",
    "TOPSHOT_PACK",
    "NFL_PACK",
    "HOTWHEELS",
    "PINNACLE",
    "GENERIC_OTHER", // fallback handler
  ],

  /* ▸ Twitter credentials */
  TWITTER_API_KEY: process.env.TWITTER_API_KEY,
  TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET,
};
