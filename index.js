// index.js (root) - UPDATED
const { subscribeToEvents } = require("fcl-subscribe");
const { handleEvent } = require("./eventHandlers");
const { fcl } = require("./flow");
// const { TwitterApi } = require('twitter-api-v2'); // REMOVE - Moved to twitterClients.js
const config = require("./config");

// *** REQUIRE the clients from the new module ***
let pinnacleBot, flowSalesBot;
try {
  const clients = require("./twitterClients");
  pinnacleBot = clients.pinnacleBot;
  flowSalesBot = clients.flowSalesBot;
  if (!pinnacleBot || !flowSalesBot) {
    throw new Error("One or both Twitter clients failed to initialize.");
  }
} catch (error) {
  console.error("Error requiring twitterClients module:", error);
  process.exit(1); // Exit if clients aren't available
}
// *** REMOVE TWITTER CLIENT INITIALIZATION - Moved to twitterClients.js ***

async function main() {
  console.log("=== Real-time Sales Bot (No DB) ===");
  console.log(`FLOW Access Node (Web gRPC): ${config.FLOW_ACCESS_NODE}`);
  console.log(`FLOW REST Endpoint:         ${config.FLOW_REST_ENDPOINT}`);
  console.log("-------- Price thresholds (USD) --------");
  // Console logs remain the same
  console.log(
    `TopShot moments    : $${config.PRICE_THRESHOLD_TOPSHOT} (Trigger BigSales > $${config.PRICE_THRESHOLD_BIGSALES})`
  );
  console.log(
    `TopShot packs      : $${config.PRICE_THRESHOLD_TOPSHOT_PACKS} (Trigger BigSales > $${config.PRICE_THRESHOLD_BIGSALES})`
  );
  console.log(
    `NFL ALL DAY packs  : $${config.PRICE_THRESHOLD_NFL_PACKS} (Trigger BigSales > $${config.PRICE_THRESHOLD_BIGSALES})`
  );
  console.log(
    `Hot Wheels         : $${config.PRICE_THRESHOLD_HOTWHEELS} (Trigger BigSales > $${config.PRICE_THRESHOLD_BIGSALES})`
  );
  console.log(
    `Pinnacle           : $${config.PRICE_THRESHOLD_PINNACLE} (PinnacleBot) AND > $${config.PRICE_THRESHOLD_BIGSALES} (BigSalesBot)`
  );
  console.log(
    `Others             : $${config.PRICE_THRESHOLD_OTHERS} (Trigger BigSales > $${config.PRICE_THRESHOLD_BIGSALES})`
  );
  console.log(`-- Specific Bot Thresholds --`);
  console.log(`Pinnacle Bot       : > $${config.PRICE_THRESHOLD_PINNACLE}`);
  console.log(`Flow Sales Bot     : > $${config.PRICE_THRESHOLD_BIGSALES}`);
  console.log("----------------------------------------");
  console.log("ENABLED_COLLECTIONS:", config.ENABLED_COLLECTIONS.join(", "));
  console.log("----------------------------------------\n");

  subscribeToEvents({
    fcl,
    events: [
      "A.4eb8a10cb9f87357.NFTStorefrontV2.ListingCompleted",
      "A.b8ea91944fd51c43.OffersV2.OfferCompleted",
      "A.c1e4f4f4c4257510.TopShotMarketV2.MomentPurchased",
      "A.c1e4f4f4c4257510.TopShotMarketV3.MomentPurchased",
    ],
    // handleEvent remains the callback
    onEvent: handleEvent,
    onError: (err) => console.error("Subscription error:", err),
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
