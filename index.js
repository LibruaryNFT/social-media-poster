// index.js (root) - Added Debug Log Status
// ... (require statements, client initialization - same as before) ...
const { subscribeToEvents } = require("fcl-subscribe");
const { handleEvent } = require("./eventHandlers");
const { fcl } = require("./flow");
const config = require("./config");
let pinnacleBot, flowSalesBot;
try {
  const clients = require("./twitterClients");
  pinnacleBot = clients.pinnacleBot;
  flowSalesBot = clients.flowSalesBot;
  if (!pinnacleBot || !flowSalesBot) {
    throw new Error("Twitter client init failed.");
  }
  console.log("Twitter clients initialized successfully.");
} catch (error) {
  console.error("Error initializing twitterClients:", error);
  process.exit(1);
}

async function main() {
  console.log("=== Real-time Sales Bot (No DB) ===");
  console.log(`FLOW Access Node (Web gRPC): ${config.FLOW_ACCESS_NODE}`);
  console.log(`FLOW REST Endpoint:        ${config.FLOW_REST_ENDPOINT}`);
  console.log("-------- Bot Thresholds (USD) --------");
  console.log(`Pinnacle Bot Threshold:`);
  console.log(
    `  - Pinnacle : > $${config.PINNACLESALESBOT_THRESHOLD_PINNACLE}`
  );
  console.log(`Flow Sales Bot Thresholds:`);
  console.log(`  - Pinnacle   : > $${config.FLOWSALESBOT_THRESHOLD_PINNACLE}`);
  console.log(`  - TopShot    : > $${config.FLOWSALESBOT_THRESHOLD_TOPSHOT}`);
  console.log(
    `  - TS Packs   : > $${config.FLOWSALESBOT_THRESHOLD_TOPSHOT_PACKS}`
  );
  console.log(`  - NFL Packs  : > $${config.FLOWSALESBOT_THRESHOLD_NFL_PACKS}`);
  console.log(
    `  - NFL ALL DAY: > $${config.FLOWSALESBOT_THRESHOLD_NFL_ALLDAY}`
  );
  console.log(`  - HotWheels  : > $${config.FLOWSALESBOT_THRESHOLD_HOTWHEELS}`);
  console.log(`  - Others     : > $${config.FLOWSALESBOT_THRESHOLD_OTHERS}`);
  console.log("----------------------------------------");
  console.log("ENABLED_COLLECTIONS:", config.ENABLED_COLLECTIONS.join(", "));
  console.log("----------------------------------------");
  console.log(
    "Monitoring Flowty Marketplace: YES (Contract: A.3cdbb3d569211ff3)"
  );
  // *** ADDED: Log Debug Status ***
  console.log(`Debug Event Logging Enabled: ${config.DEBUG_LOG_ALL_EVENTS}`);
  // ******************************
  console.log("----------------------------------------\n");

  subscribeToEvents({
    fcl,
    events: [
      "A.4eb8a10cb9f87357.NFTStorefrontV2.ListingCompleted",
      "A.3cdbb3d569211ff3.NFTStorefrontV2.ListingCompleted",
      "A.b8ea91944fd51c43.OffersV2.OfferCompleted",
      "A.c1e4f4f4c4257510.TopShotMarketV2.MomentPurchased",
      "A.c1e4f4f4c4257510.TopShotMarketV3.MomentPurchased",
    ],
    onEvent: handleEvent,
    onError: (err) => console.error("Subscription error:", err),
  });

  console.log("Event subscription started. Waiting for sales...");
}

main().catch((err) => {
  console.error("Fatal error during startup or execution:", err);
  process.exit(1);
});
