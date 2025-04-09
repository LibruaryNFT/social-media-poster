require("dotenv").config();
const fcl = require("@onflow/fcl");
const { subscribeToEvents } = require("fcl-subscribe");
const { TwitterApi } = require("twitter-api-v2");
const fetch = require("node-fetch"); // node-fetch@2 in CommonJS

//
// HARD-CODED FLOW NODE & THRESHOLDS
//
const FLOW_ACCESS_NODE = "https://rest-mainnet.onflow.org";
const PRICE_THRESHOLD_OTHERS = 10; // e.g., $10 for NFL All Day / Offers
const PRICE_THRESHOLD_TOPSHOT = 40; // e.g., $40 for Top Shot

//
// FCL CONFIG
//
fcl.config().put("accessNode.api", FLOW_ACCESS_NODE);

//
// TWITTER CREDENTIALS FROM .env
//
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

//
// Track posted TX in memory
//
const postedTxIds = new Set();

//
// MAIN: Subscribe to events
//
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

/**
 * Get transaction data directly from Flow API with enhanced logging
 * @param {string} txId - Transaction ID
 * @returns {Promise<Object|null>} Transaction data
 */
async function getTransactionData(txId) {
  try {
    console.log(`Getting transaction data from Flow API for ${txId}`);
    const response = await fetch(`${FLOW_ACCESS_NODE}/v1/transactions/${txId}`);

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const txData = await response.json();

    // Enhanced logging
    console.log(
      "---------------------- TRANSACTION DATA ----------------------"
    );
    console.log(`Transaction ID: ${txId}`);

    // Log top level fields
    console.log("Top level fields:", Object.keys(txData).join(", "));

    // Log script type and length if present
    if (txData.script) {
      console.log(`Script length: ${txData.script.length} characters`);
      console.log(`Script excerpt: ${txData.script.substring(0, 200)}...`);
    }

    // Log arguments in detail
    if (txData.arguments && Array.isArray(txData.arguments)) {
      console.log(`Found ${txData.arguments.length} arguments in transaction`);

      // Log each argument
      txData.arguments.forEach((arg, index) => {
        console.log(`Argument ${index}:`);
        console.log(`  Name: ${arg.name || "unnamed"}`);
        console.log(`  Type: ${arg.type || "unknown"}`);

        // For value, check different types
        if (arg.value === undefined) {
          console.log("  Value: undefined");
        } else if (arg.value === null) {
          console.log("  Value: null");
        } else if (typeof arg.value === "object") {
          // For objects, print keys and sample values
          const keys = Object.keys(arg.value);
          console.log(`  Value is object with keys: ${keys.join(", ")}`);

          // Log each key/value in the metadata
          keys.forEach((key) => {
            const val = arg.value[key];
            const displayVal =
              typeof val === "string"
                ? val.length > 100
                  ? val.substring(0, 100) + "..."
                  : val
                : JSON.stringify(val).substring(0, 100);
            console.log(`    ${key}: ${displayVal}`);
          });
        } else {
          // For primitives, just print the value
          console.log(`  Value: ${arg.value}`);
        }
      });
    } else {
      console.log("No arguments found in transaction data");
    }

    // Try to look for metadata in other places
    console.log("Searching for metadata in other transaction fields...");

    // Check if there's a proposals field
    if (txData.proposals) {
      console.log(
        "Found proposals field:",
        JSON.stringify(txData.proposals).substring(0, 200)
      );
    }

    // Check if there's a payload field
    if (txData.payload) {
      console.log(
        "Found payload field:",
        JSON.stringify(txData.payload).substring(0, 200)
      );
    }

    console.log(
      "---------------------- END TRANSACTION DATA ----------------------"
    );

    return txData;
  } catch (err) {
    console.error("Error fetching transaction data:", err);
    return null;
  }
}

/**
 * Enhanced logic for PackNFT metadata extraction
 */
async function extractPackNFTMetadata(txId, nftId) {
  console.log(
    `Extracting PackNFT metadata for transaction: ${txId}, NFT ID: ${nftId}`
  );

  // Initialize metadata with defaults
  const metadata = {
    name: "Unknown NFT",
    imageUrl: null,
    found: false,
    source: null,
  };

  // Get transaction data from API
  const txData = await getTransactionData(txId);

  if (!txData) {
    console.log("Failed to retrieve transaction data from API");
    return metadata;
  }

  // 1.5 New approach: Look for base64-encoded Cadence Dictionary in arguments
  if (
    (!metadata.found || !metadata.imageUrl) &&
    txData.arguments &&
    Array.isArray(txData.arguments)
  ) {
    console.log(
      "Checking for base64-encoded Cadence Dictionary in arguments..."
    );

    for (const argBase64 of txData.arguments) {
      try {
        // Decode the base64 argument
        const decoded = Buffer.from(argBase64, "base64").toString("utf-8");

        try {
          // Parse the JSON
          const parsed = JSON.parse(decoded);

          // Check if this is a Cadence Dictionary
          if (parsed.type === "Dictionary" && Array.isArray(parsed.value)) {
            console.log(
              `Found Cadence Dictionary with ${parsed.value.length} entries`
            );

            // Process dictionary entries
            for (const entry of parsed.value) {
              if (
                entry.key &&
                entry.key.type === "String" &&
                entry.value &&
                entry.value.type === "String"
              ) {
                const key = entry.key.value;
                const value = entry.value.value;

                console.log(
                  `Found key-value pair: ${key} = ${value.substring(0, 50)}${
                    value.length > 50 ? "..." : ""
                  }`
                );

                // Extract name and imageUrl
                if (key === "name" && !metadata.found) {
                  metadata.name = value;
                  metadata.found = true;
                  metadata.source = "cadence.dictionary.name";
                  console.log(
                    `Found name in Cadence Dictionary: ${metadata.name}`
                  );
                }

                if (
                  (key === "imageUrl" || key === "imageURL") &&
                  !metadata.imageUrl
                ) {
                  metadata.imageUrl = value;
                  metadata.found = true;
                  metadata.source = "cadence.dictionary.imageUrl";
                  console.log(
                    `Found imageUrl in Cadence Dictionary: ${metadata.imageUrl}`
                  );
                }
              }
            }
          }
        } catch (jsonError) {
          // Not valid JSON, continue to next argument
        }
      } catch (decodeError) {
        // Failed to decode, continue to next argument
      }
    }
  }

  // 1. First approach: Look for metadata in transaction arguments
  if (
    (!metadata.found || !metadata.imageUrl) &&
    txData.arguments &&
    Array.isArray(txData.arguments)
  ) {
    console.log("Checking transaction arguments for metadata...");

    // First, look for an argument specifically named "metadata"
    const metadataArg = txData.arguments.find((arg) => arg.name === "metadata");

    if (metadataArg && metadataArg.value) {
      console.log("Found argument named 'metadata'");

      // Try to extract name and imageUrl
      if (metadataArg.value.name) {
        metadata.name = metadataArg.value.name;
        metadata.found = true;
        metadata.source = "transaction.arguments.metadata";
        console.log(`Found name in metadata argument: ${metadata.name}`);
      }

      if (metadataArg.value.imageUrl) {
        metadata.imageUrl = metadataArg.value.imageUrl;
        metadata.found = true;
        metadata.source = "transaction.arguments.metadata";
        console.log(
          `Found imageUrl in metadata argument: ${metadata.imageUrl}`
        );
      }
    } else {
      // If there's no "metadata" argument, check all arguments for metadata-like properties
      console.log(
        "No specific 'metadata' argument found, checking all arguments..."
      );

      for (const arg of txData.arguments) {
        if (arg.value && typeof arg.value === "object") {
          // Check if this argument has name or imageUrl properties
          if (arg.value.name && !metadata.found) {
            metadata.name = arg.value.name;
            metadata.found = true;
            metadata.source = `transaction.arguments.${arg.name || "unnamed"}`;
            console.log(
              `Found name in argument ${arg.name || "unnamed"}: ${
                metadata.name
              }`
            );
          }

          if (
            (arg.value.imageUrl || arg.value.imageURL) &&
            !metadata.imageUrl
          ) {
            metadata.imageUrl = arg.value.imageUrl || arg.value.imageURL;
            metadata.found = true;
            metadata.source = `transaction.arguments.${arg.name || "unnamed"}`;
            console.log(
              `Found imageUrl in argument ${arg.name || "unnamed"}: ${
                metadata.imageUrl
              }`
            );
          }

          // Check if there's a nested metadata field
          if (arg.value.metadata && typeof arg.value.metadata === "object") {
            console.log(
              `Found nested metadata in argument ${arg.name || "unnamed"}`
            );

            if (arg.value.metadata.name && !metadata.found) {
              metadata.name = arg.value.metadata.name;
              metadata.found = true;
              metadata.source = `transaction.arguments.${
                arg.name || "unnamed"
              }.metadata`;
              console.log(`Found name in nested metadata: ${metadata.name}`);
            }

            if (
              (arg.value.metadata.imageUrl || arg.value.metadata.imageURL) &&
              !metadata.imageUrl
            ) {
              metadata.imageUrl =
                arg.value.metadata.imageUrl || arg.value.metadata.imageURL;
              metadata.found = true;
              metadata.source = `transaction.arguments.${
                arg.name || "unnamed"
              }.metadata`;
              console.log(
                `Found imageUrl in nested metadata: ${metadata.imageUrl}`
              );
            }
          }
        }
      }
    }
  }

  // 2. Second approach: Try to extract from the script
  if ((!metadata.found || !metadata.imageUrl) && txData.script) {
    console.log("Trying to extract metadata from transaction script...");

    const script = txData.script;

    // Look for patterns like 'name: "Some Name"' or 'imageUrl: "https://..."'
    const nameMatch = script.match(/name\s*:\s*"([^"]+)"/);
    const imageUrlMatch =
      script.match(/imageUrl\s*:\s*"([^"]+)"/i) ||
      script.match(/imageURL\s*:\s*"([^"]+)"/i);

    if (nameMatch && nameMatch[1] && !metadata.found) {
      metadata.name = nameMatch[1];
      metadata.found = true;
      metadata.source = "transaction.script";
      console.log(`Found name in script: ${metadata.name}`);
    }

    if (imageUrlMatch && imageUrlMatch[1] && !metadata.imageUrl) {
      metadata.imageUrl = imageUrlMatch[1];
      metadata.found = true;
      metadata.source = "transaction.script";
      console.log(`Found imageUrl in script: ${metadata.imageUrl}`);
    }
  }

  // 3. Third approach: Check for additional data in transaction results
  if (!metadata.found || !metadata.imageUrl) {
    console.log(
      "Fetching transaction results to look for metadata in events..."
    );

    try {
      const resultsResponse = await fetch(
        `${FLOW_ACCESS_NODE}/v1/transaction_results/${txId}`
      );

      if (resultsResponse.ok) {
        const resultsData = await resultsResponse.json();

        // Look at events for metadata
        if (resultsData.events && Array.isArray(resultsData.events)) {
          for (const event of resultsData.events) {
            if (event.payload) {
              try {
                // Decode the base64 payload
                const buf = Buffer.from(event.payload, "base64");
                const str = buf.toString("utf-8");

                try {
                  const payloadData = JSON.parse(str);

                  // Check for direct metadata
                  if (payloadData.name && !metadata.found) {
                    metadata.name = payloadData.name;
                    metadata.found = true;
                    metadata.source = "transaction_results.events.payload";
                    console.log(
                      `Found name in event payload: ${metadata.name}`
                    );
                  }

                  if (
                    (payloadData.imageUrl || payloadData.imageURL) &&
                    !metadata.imageUrl
                  ) {
                    metadata.imageUrl =
                      payloadData.imageUrl || payloadData.imageURL;
                    metadata.found = true;
                    metadata.source = "transaction_results.events.payload";
                    console.log(
                      `Found imageUrl in event payload: ${metadata.imageUrl}`
                    );
                  }

                  // Check for nested metadata
                  if (
                    payloadData.metadata &&
                    typeof payloadData.metadata === "object"
                  ) {
                    if (payloadData.metadata.name && !metadata.found) {
                      metadata.name = payloadData.metadata.name;
                      metadata.found = true;
                      metadata.source =
                        "transaction_results.events.payload.metadata";
                      console.log(
                        `Found name in event payload metadata: ${metadata.name}`
                      );
                    }

                    if (
                      (payloadData.metadata.imageUrl ||
                        payloadData.metadata.imageURL) &&
                      !metadata.imageUrl
                    ) {
                      metadata.imageUrl =
                        payloadData.metadata.imageUrl ||
                        payloadData.metadata.imageURL;
                      metadata.found = true;
                      metadata.source =
                        "transaction_results.events.payload.metadata";
                      console.log(
                        `Found imageUrl in event payload metadata: ${metadata.imageUrl}`
                      );
                    }
                  }
                } catch (jsonError) {
                  // Not valid JSON, skip
                }
              } catch (decodeError) {
                // Failed to decode, skip
              }
            }
          }
        }
      }
    } catch (resultsError) {
      console.log(
        `Error fetching transaction results: ${resultsError.message}`
      );
    }
  }

  // Log final result
  console.log("PackNFT Metadata Extraction Result:");
  console.log(`- Name: ${metadata.name}`);
  console.log(`- ImageUrl: ${metadata.imageUrl || "Not found"}`);
  console.log(`- Source: ${metadata.source || "Not found"}`);
  console.log(`- Success: ${metadata.found ? "YES" : "NO"}`);

  return metadata;
}

//
// FETCH & UPLOAD IMAGE
//
async function fetchAndUploadImage(url) {
  try {
    console.log("Fetching image:", url);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("Image fetch failed:", resp.status, resp.statusText);
      return null;
    }
    const buffer = await resp.buffer();

    const contentType = resp.headers.get("content-type") || "";
    let mediaType = "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      mediaType = "jpg";
    } else if (contentType.includes("gif")) {
      mediaType = "gif";
    }

    console.log("Uploading image to Twitter...");
    const mediaId = await twitterClient.v1.uploadMedia(buffer, {
      type: mediaType,
    });
    console.log("Posted media ID:", mediaId);
    return mediaId;
  } catch (err) {
    console.error("Error uploading image:", err);
    return null;
  }
}

//
// PARSE TRANSACTION METADATA (Legacy method for non-PackNFT)
//
async function getTransactionMetadata(txId) {
  const txResult = await fcl.send([fcl.getTransaction(txId)]).then(fcl.decode);
  if (!Array.isArray(txResult.arguments)) return {};

  const finalData = {};

  for (const argBase64 of txResult.arguments) {
    const buf = Buffer.from(argBase64, "base64");
    const str = buf.toString("utf-8");

    try {
      const parsed = JSON.parse(str);
      // If it's plain JSON, merge
      if (parsed && typeof parsed === "object" && !parsed.type) {
        Object.assign(finalData, parsed);
      } else {
        // Possibly a Cadence dictionary
        const possibleDict = parseCadenceDictionary(parsed);
        if (Object.keys(possibleDict).length > 0) {
          Object.assign(finalData, possibleDict);
        }
      }
    } catch {
      // skip
    }
  }
  return finalData;
}

/**
 * Post a tweet with attachment if available
 * @param {string} tweetText - The text content of the tweet
 * @param {string} imageUrl - Optional image URL to attach
 * @param {string} txId - Transaction ID (for logging)
 */
async function postTweet(tweetText, imageUrl, txId) {
  try {
    console.log("Tweeting:\n", tweetText);

    // Upload image if available
    let mediaId = null;
    if (imageUrl) {
      mediaId = await fetchAndUploadImage(imageUrl);
    }

    // Post to Twitter
    if (mediaId) {
      const response = await twitterClient.v2.tweet(tweetText, {
        media: { media_ids: [mediaId] },
      });
      console.log(`Tweet posted with image. ID: ${response.data.id}`);
    } else {
      const response = await twitterClient.v2.tweet(tweetText);
      console.log(`Tweet posted (text-only). ID: ${response.data.id}`);
    }

    // Mark posted
    postedTxIds.add(txId);
  } catch (err) {
    console.error("Error posting tweet:", err);
  }
}

function parseCadenceDictionary(obj) {
  if (!obj || obj.type !== "Dictionary" || !Array.isArray(obj.value)) {
    return {};
  }
  const result = {};
  for (const entry of obj.value) {
    const k = entry.key?.value;
    const v = entry.value?.value;
    if (typeof k === "string" && typeof v === "string") {
      result[k] = v;
    }
  }
  return result;
}

//
// HANDLE EVENT
//
async function handleEvent(event) {
  try {
    const txId = event.transactionId;

    // unify price
    const rawPrice = parseFloat(
      event.data?.salePrice || event.data?.price || "0"
    );
    // is it a TopShot event?
    const isTopShot =
      event.type.endsWith("TopShotMarketV2.MomentPurchased") ||
      event.type.endsWith("TopShotMarketV3.MomentPurchased");
    // which threshold to use
    const threshold = isTopShot
      ? PRICE_THRESHOLD_TOPSHOT
      : PRICE_THRESHOLD_OTHERS;

    // If it's OffersV2.OfferCompleted with no purchase or zero price, skip silently
    if (event.type.endsWith("OfferCompleted")) {
      // If there's a "purchased" flag and it's not true, skip quietly
      // If rawPrice is 0, also skip quietly
      if (!event.data?.purchased || rawPrice === 0) {
        return; // no logs, just skip
      }
    }

    // If listingCompleted => purchased must be true => skip with log
    if (event.type.endsWith("ListingCompleted") && !event.data?.purchased) {
      console.log("Listing is not purchased, skipping.");
      return;
    }

    // Format prices with cents for logs
    const priceFmt = rawPrice.toFixed(2);
    const thresholdFmt = threshold.toFixed(2);

    // Check threshold
    if (rawPrice < threshold) {
      console.log(
        `Skipping sale: $${priceFmt} < threshold $${thresholdFmt} for ${event.type}`
      );
      return;
    }

    // Already posted?
    if (postedTxIds.has(txId)) {
      console.log(`Already tweeted tx ${txId}, skipping.`);
      return;
    }

    // Get NFT type from event data
    const nftType = event.data?.nftType?.typeID || "UnknownNFTType";
    console.log(`NFT Type: ${nftType}`);

    // Check for ANY PackNFT type (not just a specific contract address)
    const isPackNFT = nftType.includes(".PackNFT.NFT");

    console.log(`Is PackNFT? ${isPackNFT}`);

    // Process events based on type
    if (isTopShot) {
      // TopShot specific processing (unchanged)
      const id = event.data?.id || "UnknownID";
      const momentName = event.data?.momentName || "Unknown Moment";
      const seller = event.data?.seller || "UnknownSeller";

      let imageUrl = event.data?.momentThumbnailURL || null;
      if (!imageUrl && id !== "UnknownID") {
        imageUrl = `https://assets.nbatopshot.com/media/${id}/image?width=250&quality=100`;
      }

      const tweetText = `BIG SALE on @NBATopShot
Name: ${momentName}
ID: ${id}
Price: $${priceFmt}
Seller: ${seller}
Tx: https://flowscan.io/transaction/${txId}`;

      // Post tweet
      await postTweet(tweetText, imageUrl, txId);
    } else if (isPackNFT) {
      // Enhanced PackNFT specific processing
      console.log("PackNFT detected, using enhanced metadata extraction");

      // Get NFT ID from event
      const nftId =
        event.data?.nftID ||
        event.data?.nftUUID ||
        event.data?.id ||
        "UnknownNFTID";

      // Use enhanced metadata extraction
      const metadata = await extractPackNFTMetadata(txId, nftId);

      // Format the tweet with the metadata
      const tweetText = `🔥 BIG SALE! 🔥
Name: ${metadata.name}
Type: ${nftType}
ID: ${nftId}
Price: $${priceFmt}
Tx: https://flowscan.io/transaction/${txId}`;

      // Post tweet with image if available
      await postTweet(tweetText, metadata.imageUrl, txId);
    } else {
      // Standard processing for other NFTs
      try {
        // Get basic metadata
        const txMetadata = await getTransactionMetadata(txId);

        // Extract name and imageUrl
        const nftName =
          txMetadata.name || event.data?.metadata?.name || "Unknown NFT";
        const imageUrl =
          txMetadata.imageUrl || event.data?.metadata?.imageUrl || null;
        const nftId =
          event.data?.nftID ||
          event.data?.nftUUID ||
          event.data?.id ||
          "UnknownNFTID";

        const tweetText = `BIG SALE!
Name: ${nftName}
Type: ${nftType}
ID: ${nftId}
Price: $${priceFmt}
Tx: https://flowscan.io/transaction/${txId}`;

        // Post tweet
        await postTweet(tweetText, imageUrl, txId);
      } catch (err) {
        console.error("Error processing standard NFT:", err);

        // Fallback to basic tweet without metadata
        const nftId =
          event.data?.nftID ||
          event.data?.nftUUID ||
          event.data?.id ||
          "UnknownNFTID";

        const tweetText = `BIG SALE!
Name: Unknown NFT
Type: ${nftType}
ID: ${nftId}
Price: $${priceFmt}
Tx: https://flowscan.io/transaction/${txId}`;

        await postTweet(tweetText, null, txId);
      }
    }
  } catch (err) {
    console.error("Error in handleEvent:", err);
  }
}

//
// START
//
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
