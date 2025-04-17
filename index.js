const { subscribeToEvents } = require("fcl-subscribe");
const { handleEvent } = require("./eventHandlers");
const { fcl } = require("./flow");

const {
  FLOW_ACCESS_NODE,
  FLOW_REST_ENDPOINT,
  PRICE_THRESHOLD_OTHERS,
  PRICE_THRESHOLD_TOPSHOT,
  PRICE_THRESHOLD_TOPSHOT_PACKS,
  PRICE_THRESHOLD_NFL_PACKS,
  PRICE_THRESHOLD_HOTWHEELS,
  PRICE_THRESHOLD_PINNACLE,
  ENABLED_COLLECTIONS,
} = require("./config");

async function main() {
  console.log("=== Real-time Sales Bot (No DB) ===");
  console.log(`FLOW Access Node (Web gRPC): ${FLOW_ACCESS_NODE}`);
  console.log(`FLOW REST Endpoint:         ${FLOW_REST_ENDPOINT}`);
  console.log("-------- Price thresholds (USD) --------");
  console.log(`OTHERS             : $${PRICE_THRESHOLD_OTHERS}`);
  console.log(`TopShot moments    : $${PRICE_THRESHOLD_TOPSHOT}`);
  console.log(`TopShot packs      : $${PRICE_THRESHOLD_TOPSHOT_PACKS}`);
  console.log(`NFL ALL DAY packs  : $${PRICE_THRESHOLD_NFL_PACKS}`);
  console.log(`Hot Wheels         : $${PRICE_THRESHOLD_HOTWHEELS}`);
  console.log(`Pinnacle           : $${PRICE_THRESHOLD_PINNACLE}`);
  console.log("----------------------------------------");
  console.log("ENABLED_COLLECTIONS:", ENABLED_COLLECTIONS.join(", "));
  console.log("----------------------------------------\n");

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

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
