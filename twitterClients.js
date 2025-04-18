// twitterClients.js
const { TwitterApi } = require("twitter-api-v2");
const config = require("./config"); // Load your updated config

let pinnacleBot, flowSalesBot;

try {
  console.log("Initializing Twitter clients...");
  // Client for Pinnacle Bot Account
  const pinnacleClient = new TwitterApi({
    appKey: config.TWITTER_API_KEY,
    appSecret: config.TWITTER_API_SECRET,
    accessToken: config.PINNACLEPINBOT_ACCESS_TOKEN,
    accessSecret: config.PINNACLEPINBOT_ACCESS_SECRET,
  });
  pinnacleBot = pinnacleClient.readWrite;
  console.log("Pinnacle Bot client initialized.");

  // Client for Flow Sales Bot Account
  const flowSalesClient = new TwitterApi({
    appKey: config.TWITTER_API_KEY,
    appSecret: config.TWITTER_API_SECRET,
    accessToken: config.FLOWSALESBOT_ACCESS_TOKEN,
    accessSecret: config.FLOWSALESBOT_ACCESS_SECRET,
  });
  flowSalesBot = flowSalesClient.readWrite;
  console.log("Flow Sales Bot client initialized.");
} catch (error) {
  console.error(
    "FATAL: Failed to initialize Twitter clients. Check credentials in .env and config.js",
    error
  );
  // You might want to re-throw or handle differently depending on desired behavior
  // For now, we log and export potentially undefined clients, index.js should check
  // Or, throw error here and index.js catches it on require
  throw new Error("Twitter Client Initialization Failed");
}

// Export the initialized clients
module.exports = { pinnacleBot, flowSalesBot };
