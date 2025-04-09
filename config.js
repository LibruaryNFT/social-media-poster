require("dotenv").config();

module.exports = {
  // FLOW Access Node
  FLOW_ACCESS_NODE: "https://rest-mainnet.onflow.org",

  // Price thresholds
  PRICE_THRESHOLD_OTHERS: 10, // e.g., $10 for NFL All Day / Offers
  PRICE_THRESHOLD_TOPSHOT: 40, // e.g., $40 for Top Shot

  // Twitter credentials
  TWITTER_API_KEY: process.env.TWITTER_API_KEY,
  TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET,
};
