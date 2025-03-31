require("dotenv").config();
const { MongoClient } = require("mongodb");
const { TwitterApi } = require("twitter-api-v2");

// MongoDB connection
const mongoClient = new MongoClient(process.env.MONGODB_URI);
let eventsCollection, postedEventsCollection;

// Twitter client setup
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// Configuration
const PRICE_THRESHOLD = parseFloat(process.env.PRICE_THRESHOLD) || 100;
const CHECK_INTERVAL =
  (parseInt(process.env.CHECK_INTERVAL_SECONDS) || 60) * 1000;
let lastCheckedTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

async function connectToMongo() {
  try {
    await mongoClient.connect();
    const database = mongoClient.db("flow_events");
    eventsCollection = database.collection("raw_events");
    postedEventsCollection = database.collection("posted_events");

    // Create an index for the posted events collection
    await postedEventsCollection.createIndex(
      { transactionId: 1 },
      { unique: true }
    );

    console.log("Connected to MongoDB database: flow_events");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

async function findHighValueSales() {
  try {
    const query = {
      type: "A.4eb8a10cb9f87357.NFTStorefrontV2.ListingCompleted",
      "data.purchased": true,
      "data.salePrice": { $gt: `${PRICE_THRESHOLD}.00000000` },
      processedAt: { $gt: lastCheckedTime },
    };

    const sales = await eventsCollection
      .find(query)
      .sort({ processedAt: 1 })
      .toArray();
    console.log(`Found ${sales.length} sales over ${PRICE_THRESHOLD} FLOW`);
    return sales;
  } catch (error) {
    console.error("Error finding high value sales:", error);
    return [];
  }
}

async function hasBeenPosted(transactionId) {
  const count = await postedEventsCollection.countDocuments({ transactionId });
  return count > 0;
}

async function markAsPosted(event, platforms) {
  await postedEventsCollection.insertOne({
    transactionId: event.transactionId,
    eventIndex: event.eventIndex,
    postedAt: new Date(),
    salePrice: event.data.salePrice,
    nftType: event.data.nftType.typeID,
    platforms: platforms, // e.g. ["twitter", "discord"]
  });
}

function getNftContractName(typeID) {
  // Extract contract name from typeID string like A.0b2a3299cc857e29.TopShot.NFT
  const parts = typeID.split(".");
  if (parts.length >= 3) {
    return parts[2]; // Return "TopShot", "PackNFT", etc.
  }
  return "NFT";
}

async function formatTwitterPost(event) {
  // Get NFT type in a user-friendly format
  const nftTypeRaw = event.data.nftType.typeID;
  const contractName = getNftContractName(nftTypeRaw);

  // Format sale price
  const price = parseFloat(event.data.salePrice).toFixed(2);

  // Transaction link
  const txLink = `https://flowscan.org/transaction/${event.transactionId}`;

  // Create post text
  let post = `🔥 BIG SALE: ${contractName}\n\n`;
  post += `💰 Price: ${price} FLOW\n`;
  post += `🔗 ${txLink}\n\n`;
  post += `#FlowBlockchain #NFT #${contractName}`;

  return post;
}

async function postToTwitter(postContent) {
  try {
    const tweet = await twitterClient.v2.tweet(postContent);
    console.log(`Successfully posted to Twitter, ID: ${tweet.data.id}`);
    return true;
  } catch (error) {
    console.error(`Error posting to Twitter: ${error.message}`);
    return false;
  }
}

// This function could be expanded to post to other platforms
async function postToSocialMedia(event) {
  const platforms = [];

  // Format and post to Twitter
  const twitterContent = await formatTwitterPost(event);
  console.log(`Posting to Twitter: ${twitterContent}`);

  const twitterSuccess = await postToTwitter(twitterContent);
  if (twitterSuccess) {
    platforms.push("twitter");
  }

  // You can add more platforms here in the future
  // e.g. Discord, Telegram, etc.

  return platforms;
}

async function checkAndPost() {
  try {
    // Find high value sales
    const sales = await findHighValueSales();

    // Process each sale
    for (const sale of sales) {
      // Update last checked time
      if (sale.processedAt > lastCheckedTime) {
        lastCheckedTime = sale.processedAt;
      }

      // Check if already posted
      const alreadyPosted = await hasBeenPosted(sale.transactionId);
      if (alreadyPosted) {
        console.log(`Sale ${sale.transactionId} already posted, skipping`);
        continue;
      }

      // Post to social media platforms
      const postedPlatforms = await postToSocialMedia(sale);

      if (postedPlatforms.length > 0) {
        // Mark as posted if at least one platform was successful
        await markAsPosted(sale, postedPlatforms);
        console.log(
          `Marked sale ${
            sale.transactionId
          } as posted to: ${postedPlatforms.join(", ")}`
        );
      }

      // Wait a moment between posts to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("Error in check and post process:", error);
  }

  // Schedule next check
  console.log(`Next check in ${CHECK_INTERVAL / 1000} seconds`);
  setTimeout(checkAndPost, CHECK_INTERVAL);
}

async function main() {
  console.log("Starting Flow NFT Social Media Poster...");
  console.log(`Price threshold: ${PRICE_THRESHOLD} FLOW`);
  console.log(`Check interval: ${CHECK_INTERVAL / 1000} seconds`);

  await connectToMongo();
  await checkAndPost();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
