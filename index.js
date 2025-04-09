const { subscribeToEvents } = require("fcl-subscribe");
const { handleEvent } = require("./eventHandlers");
const { fcl } = require("./flow");
const {
  FLOW_ACCESS_NODE,
  PRICE_THRESHOLD_OTHERS,
  PRICE_THRESHOLD_TOPSHOT,
} = require("./config");

async function main() {
  console.log("=== Real-time Sales Bot (No DB) ===");
  console.log(`FLOW Access Node: ${FLOW_ACCESS_NODE}`);
  console.log(`PRICE_THRESHOLD_OTHERS: $${PRICE_THRESHOLD_OTHERS}`);
  console.log(`PRICE_THRESHOLD_TOPSHOT: $${PRICE_THRESHOLD_TOPSHOT}`);

  subscribeToEvents({
    fcl,
    events: [
      "A.4eb8a10cb9f87357.NFTStorefrontV2.ListingCompleted",
      "A.b8ea91944fd51c43.OffersV2.OfferCompleted",
      "A.c1e4f4f4c4257510.TopShotMarketV2.MomentPurchased",
      "A.c1e4f4f4c4257510.TopShotMarketV3.MomentPurchased",
    ],
    onEvent: handleEvent,
    onError: (err) => console.error("Subscription error:", err),
  });
}

// Start
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
