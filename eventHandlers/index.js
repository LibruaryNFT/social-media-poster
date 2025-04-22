// eventHandlers/index.js - FINAL VERSION (Apr 21, 2025) - Strict Conditional Logging

const { getTransactionResults } = require("../flow");
const { postTweet } = require("../twitter");
const { logAllEvents } = require("./logger"); // Import the logger

// Import specific handlers
const { handleTopShot } = require("./topShotHandler");
const { handlePackNFT } = require("./packNftHandler");
const { handleHotWheels } = require("./hotWheelsHandler");
const { handlePinnacle } = require("./pinnacleHandler");
const { handleAllDay } = require("./allDayHandler");
const { handleFallback } = require("./fallbackHandler");

const { getFlowPrice } = require("../metadata");
const config = require("../config"); // Uses new prefixed threshold names

// Import the Twitter clients
const { pinnacleBot, flowSalesBot } = require("../twitterClients");

// --- Constants --- (remain the same)
const PINNACLE_NFT_TYPE = "A.edf9df96c92f4595.Pinnacle.NFT";
const HW_CARD_TYPE = "A.d0bcefdf1e67ea85.HWGarageCardV2.NFT";
const HW_TOKEN_TYPE = "A.d0bcefdf1e67ea85.HWGarageTokenV2.NFT";
const TOPSHOT_PACK_CONTRACT = "A.0b2a3299cc857e29.PackNFT.NFT";
const NFL_PACK_CONTRACT = "A.e4cf4bdc1751c65d.PackNFT.NFT";
const TOPSHOT_MOMENT_TYPE = "A.0b2a3299cc857e29.TopShot.NFT";
const NFL_ALLDAY_NFT_TYPE = "A.e4cf4bdc1751c65d.AllDay.NFT";
const NFTSTOREFRONT_V2_STD_PREFIX = "A.4eb8a10cb9f87357.NFTStorefrontV2";
const NFTSTOREFRONT_V2_FLOWTY_PREFIX = "A.3cdbb3d569211ff3.NFTStorefrontV2";
const OFFERS_V2_PREFIX = "A.b8ea91944fd51c43.OffersV2";
const TOPSHOT_V2_PREFIX = "A.c1e4f4f4c4257510.TopShotMarketV2";
const TOPSHOT_V3_PREFIX = "A.c1e4f4f4c4257510.TopShotMarketV3";
const FLOW_VAULT = "A.1654653399040a61.FlowToken.Vault";
// --- End Constants ---

const postedTxIds = new Set();
const isEnabled = (name) => config.ENABLED_COLLECTIONS.includes(name);

// --- Helper Functions --- (remain the same)
function determineMarketplaceSource(eventType) {
  if (eventType.startsWith(NFTSTOREFRONT_V2_FLOWTY_PREFIX)) return "Flowty";
  if (eventType.startsWith(NFTSTOREFRONT_V2_STD_PREFIX))
    return "NFTStorefrontV2";
  if (eventType.startsWith(OFFERS_V2_PREFIX)) return "OffersV2";
  if (
    eventType.startsWith(TOPSHOT_V2_PREFIX) ||
    eventType.startsWith(TOPSHOT_V3_PREFIX)
  )
    return "TopShotMarket";
  return "Unknown";
}
function mapNftTypeToCollectionName(nftType) {
  if (nftType === TOPSHOT_MOMENT_TYPE) return "TOPSHOT_MOMENT";
  if (nftType === TOPSHOT_PACK_CONTRACT) return "TOPSHOT_PACK";
  if (nftType === NFL_PACK_CONTRACT) return "NFL_PACK";
  if (nftType === NFL_ALLDAY_NFT_TYPE) return "NFL_ALLDAY";
  if (nftType === HW_TOKEN_TYPE || nftType === HW_CARD_TYPE) return "HOTWHEELS";
  if (nftType === PINNACLE_NFT_TYPE) return "PINNACLE";
  if (
    typeof nftType === "string" &&
    nftType.startsWith("A.") &&
    nftType.split(".").length >= 3
  )
    return "GENERIC_OTHER";
  return "GENERIC_OTHER";
}
function getFlowSalesBotCollectionThreshold(collectionName) {
  switch (collectionName) {
    case "TOPSHOT_MOMENT":
      return config.FLOWSALESBOT_THRESHOLD_TOPSHOT;
    case "TOPSHOT_PACK":
      return config.FLOWSALESBOT_THRESHOLD_TOPSHOT_PACKS;
    case "NFL_PACK":
      return config.FLOWSALESBOT_THRESHOLD_NFL_PACKS;
    case "NFL_ALLDAY":
      return config.FLOWSALESBOT_THRESHOLD_NFL_ALLDAY;
    case "HOTWHEELS":
      return config.FLOWSALESBOT_THRESHOLD_HOTWHEELS;
    case "GENERIC_OTHER":
    default:
      return config.FLOWSALESBOT_THRESHOLD_OTHERS;
  }
}
function isNftTypeString(typeString) {
  if (!typeString || typeof typeString !== "string") {
    return false;
  }
  return typeString.includes(".NFT") || typeString.includes("NonFungibleToken");
}
async function ensureTxResults(
  txId,
  existingTxResults,
  currentNftType,
  currentNftId
) {
  // ... (ensureTxResults function remains the same - fetches results, refines type/id) ...
  let results = existingTxResults;
  let refinedType = currentNftType;
  let refinedId = currentNftId;
  if (!results) {
    try {
      results = await getTransactionResults(txId);
      if (!results?.events) {
        console.warn(`No events found in txResults for ${txId}`);
        results = { events: [] };
      }
    } catch (fetchError) {
      console.error(
        `Failed to fetch transaction results for ${txId}:`,
        fetchError
      );
      results = { events: [] };
    }
  }
  let bestFoundType = refinedType;
  if (results?.events?.length > 0) {
    for (const ev of results.events) {
      if (
        ev.type.includes(".Deposited") ||
        ev.type.includes(".Withdrawn") ||
        ev.type.endsWith(".Minted") ||
        ev.type.includes("NonFungibleToken") ||
        ev.type.includes("NFT")
      ) {
        try {
          const decoded = JSON.parse(
            Buffer.from(ev.payload, "base64").toString("utf-8")
          );
          const fields = decoded?.value?.fields || [];
          const typeField = fields.find(
            (f) => f.name === "type" || f.name === "nftType"
          );
          let foundType =
            typeField?.value?.value ||
            decoded?.value?.type?.typeID ||
            decoded?.value?.data?.type?.typeID ||
            fields.find((f) => f.name === "id")?.value?.type?.type?.typeID;
          if (
            !foundType &&
            decoded?.value?.type &&
            typeof decoded.value.type === "string" &&
            decoded.value.type.startsWith("A.")
          ) {
            foundType = decoded.value.type;
          }
          if (
            foundType &&
            typeof foundType === "string" &&
            foundType.startsWith("A.")
          ) {
            const isFoundTypeNft = isNftTypeString(foundType);
            const isBestTypeNft = isNftTypeString(bestFoundType);
            if (
              (isFoundTypeNft && !isBestTypeNft) ||
              bestFoundType === "Unknown"
            ) {
              let betterMatch = true;
              if (isFoundTypeNft && isBestTypeNft) {
                betterMatch =
                  foundType.includes(".NFT") || !bestFoundType.includes(".NFT");
              }
              if (betterMatch) {
                bestFoundType = foundType;
              }
            }
          }
        } catch (e) {
          /* ignore */
        }
      }
    }
    if (bestFoundType !== refinedType) {
      console.log(
        `Refined nftType for tx ${txId} from "${refinedType}" to "${bestFoundType}".`
      );
      refinedType = bestFoundType;
    }
  }
  if (
    (refinedId === null || refinedId === "UnknownNFTID") &&
    refinedType !== "Unknown" &&
    results?.events?.length > 0
  ) {
    for (const ev of results.events) {
      const typeMatch = ev.type.includes(refinedType);
      const genericMatch =
        ev.type.includes("NonFungibleToken") ||
        ev.type.includes(".Token") ||
        ev.type.includes(".NFT");
      if (typeMatch || genericMatch) {
        try {
          const decoded = JSON.parse(
            Buffer.from(ev.payload, "base64").toString("utf-8")
          );
          const fields = decoded?.value?.fields || [];
          const idField = fields.find(
            (f) =>
              f.name === "id" ||
              f.name === "nftID" ||
              f.name === "tokenID" ||
              f.name === "momentID"
          );
          let foundId = idField?.value?.value;
          if (
            foundId === undefined &&
            (typeof decoded?.value?.id === "number" ||
              typeof decoded.value.id === "string")
          ) {
            foundId = decoded.value.id;
          }
          if (foundId !== undefined && foundId !== null) {
            refinedId = String(foundId);
            break;
          }
        } catch (e) {
          /* ignore */
        }
      }
    }
  }
  if (refinedId === null) refinedId = "UnknownNFTID";
  return { txResults: results, nftType: refinedType, nftId: refinedId };
}
// --- End Helper Functions ---

// --- Main Event Handler ---
async function handleEvent(event) {
  if (!pinnacleBot || !flowSalesBot) {
    console.error(
      "Twitter clients not available in handleEvent. Aborting processing."
    );
    return;
  }
  const txId = event.transactionId;

  try {
    if (postedTxIds.has(txId)) return;

    // Initial data extraction
    const rawPrice = parseFloat(
      event.data?.salePrice || event.data?.price || "0"
    );
    const vaultType = event.data?.salePaymentVaultType || "";
    const evtType = event.type;
    const marketplaceSource = determineMarketplaceSource(evtType);
    let initialNftType =
      event.data?.nftType ??
      event.data?.nftType?.typeID ??
      (evtType.endsWith("MomentPurchased") ? TOPSHOT_MOMENT_TYPE : null) ??
      "Unknown";
    let initialNftId = event.data?.nftID ?? event.data?.id ?? null;

    // Early exit checks
    if (rawPrice <= 0) return;
    if (evtType.endsWith("OfferCompleted") && !event.data?.purchased) return;
    if (evtType.endsWith("ListingCompleted") && !event.data?.purchased) return;

    // Price conversion
    const flowUsd = await getFlowPrice();
    if (flowUsd === null) {
      console.error(`Could not get FLOW price for tx ${txId}, skipping.`);
      return;
    }
    const priceUSD = vaultType === FLOW_VAULT ? rawPrice * flowUsd : rawPrice;
    if (priceUSD <= 0) return;

    // Display price string
    let displayPrice;
    if (vaultType === FLOW_VAULT && rawPrice > 0) {
      displayPrice = `${rawPrice.toFixed(2)} FLOW (~$${priceUSD.toFixed(
        2
      )} USD)`;
    } else if (rawPrice > 0) {
      const flowEq = priceUSD / flowUsd;
      displayPrice = `$${priceUSD.toFixed(2)} USD (~${flowEq.toFixed(2)} FLOW)`;
    } else {
      return;
    }

    // Fetch Tx Results and Refine Type/ID (Done early)
    let txResultsData = await ensureTxResults(
      txId,
      null,
      initialNftType,
      initialNftId
    );
    let txResults = txResultsData.txResults;
    let nftType = txResultsData.nftType;
    let nftId = txResultsData.nftId;

    // *** Check for Debug Logging Mode ***
    // This is now the ONLY place logAllEvents is called directly by handleEvent
    if (config.DEBUG_LOG_ALL_EVENTS && txResults?.events) {
      console.log(
        `\n[DEBUG MODE] Logging all events for tx ${txId} (Price: $${priceUSD.toFixed(
          2
        )}, Type: ${nftType})...`
      );
      logAllEvents(txResults.events);
    }
    // *****************************************

    // Log warnings if unknown
    if (nftType === "Unknown")
      console.warn(`NFT Type remains Unknown for tx ${txId} after refinement.`);
    if (nftId === "UnknownNFTID")
      console.warn(`NFT ID remains Unknown for tx ${txId} after refinement.`);

    // Map to collection name & check enablement
    const collectionName = mapNftTypeToCollectionName(nftType);
    if (!isEnabled(collectionName)) {
      return;
    }

    // Determine Handler Function
    let handlerFn = handleFallback;
    if (collectionName === "TOPSHOT_MOMENT") handlerFn = handleTopShot;
    else if (collectionName === "NFL_ALLDAY") handlerFn = handleAllDay;
    else if (collectionName === "TOPSHOT_PACK" || collectionName === "NFL_PACK")
      handlerFn = handlePackNFT;
    else if (collectionName === "HOTWHEELS") handlerFn = handleHotWheels;
    else if (collectionName === "PINNACLE") handlerFn = handlePinnacle;

    // Prepare handler args
    const handlerArgs = {
      event,
      txResults,
      displayPrice,
      marketplaceSource,
      nftType,
      nftId,
    };

    let tweetedPinnacle = false;
    let tweetedBigSale = false;
    let tweetResPinnacle = null;
    let tweetResBigSale = null;
    // Removed loggedEvents flag as it's no longer needed here

    // --- Pinnacle Bot Logic ---
    const pinnacleBotThreshold = config.PINNACLESALESBOT_THRESHOLD_PINNACLE;
    if (collectionName === "PINNACLE" && priceUSD > pinnacleBotThreshold) {
      console.log(
        `Pinnacle sale ($${priceUSD.toFixed(
          2
        )}) meets PinnacleBot threshold ($${pinnacleBotThreshold}).`
      );
      if (nftId !== "UnknownNFTID" && nftType !== "Unknown") {
        tweetResPinnacle = await handlerFn(handlerArgs);
      } else {
        console.warn(
          `Pinnacle threshold met for tx ${txId}, but NFT ID/Type unknown...`
        );
      }

      if (tweetResPinnacle?.tweetText) {
        try {
          console.log(`Tweeting Pinnacle sale to PinnacleBot...`);
          await postTweet(
            pinnacleBot,
            tweetResPinnacle.tweetText,
            tweetResPinnacle.imageUrl
          );
          // *** REMOVED logAllEvents call from here ***
          tweetedPinnacle = true;
        } catch (error) {
          console.error("Error tweeting to PinnacleBot:", error);
        }
      } else if (nftId !== "UnknownNFTID" && nftType !== "Unknown") {
        console.warn(
          `Pinnacle threshold met for tx ${txId}, but no tweet content generated.`
        );
      }
    }

    // --- Flow Sales Bot Logic ---
    let salesBotThreshold;
    let thresholdSource = "UNKNOWN";
    if (collectionName === "PINNACLE") {
      salesBotThreshold = config.FLOWSALESBOT_THRESHOLD_PINNACLE;
      thresholdSource = `FLOWSALESBOT_THRESHOLD_PINNACLE`;
    } else {
      salesBotThreshold = getFlowSalesBotCollectionThreshold(collectionName);
      thresholdSource = `FLOWSALESBOT_THRESHOLD_${collectionName}`;
    }

    if (priceUSD > salesBotThreshold) {
      console.log(
        `Sale ($${priceUSD.toFixed(
          2
        )}, type: ${collectionName}) meets FlowSalesBot threshold ($${salesBotThreshold.toFixed(
          2
        )} from ${thresholdSource}).`
      );
      if (nftId !== "UnknownNFTID" && nftType !== "Unknown") {
        if (!tweetResPinnacle) {
          tweetResBigSale = await handlerFn(handlerArgs);
        } else {
          tweetResBigSale = tweetResPinnacle;
        }
      } else {
        console.warn(
          `FlowSalesBot threshold met for tx ${txId}, but NFT ID/Type unknown...`
        );
      }

      if (tweetResBigSale?.tweetText) {
        try {
          console.log(`Tweeting sale to FlowSalesBot...`);
          await postTweet(
            flowSalesBot,
            tweetResBigSale.tweetText,
            tweetResBigSale.imageUrl
          );
          // *** REMOVED logAllEvents call from here ***
          tweetedBigSale = true;
        } catch (error) {
          console.error("Error tweeting to FlowSalesBot:", error);
        }
      } else if (
        nftId !== "UnknownNFTID" &&
        nftType !== "Unknown" &&
        !tweetResBigSale
      ) {
        console.warn(
          `FlowSalesBot threshold met for tx ${txId}, but no tweet content generated or reused.`
        );
      }
    }

    // --- Post-Tweet Logic ---
    if (tweetedPinnacle || tweetedBigSale) {
      postedTxIds.add(txId);
      if (postedTxIds.size > 10000) {
        const oldestKeys = Array.from(postedTxIds).slice(0, 1000);
        oldestKeys.forEach((key) => postedTxIds.delete(key));
        console.log("Cleaned up postedTxIds set.");
      }
    } else if (priceUSD > 0) {
      // Log sales that didn't meet criteria
      let applicableThreshold;
      let thresholdName;
      if (collectionName === "PINNACLE") {
        applicableThreshold = Math.min(
          config.PINNACLESALESBOT_THRESHOLD_PINNACLE,
          config.FLOWSALESBOT_THRESHOLD_PINNACLE
        );
        thresholdName = `PINNACLEBOT ($${config.PINNACLESALESBOT_THRESHOLD_PINNACLE}) / FLOWSALESBOT_PINNACLE ($${config.FLOWSALESBOT_THRESHOLD_PINNACLE})`;
      } else {
        applicableThreshold =
          getFlowSalesBotCollectionThreshold(collectionName);
        const configKeySuffix =
          collectionName === "GENERIC_OTHER" || collectionName === "Unknown"
            ? "OTHERS"
            : collectionName.toUpperCase();
        const configKeyName = `FLOWSALESBOT_THRESHOLD_${configKeySuffix}`;
        thresholdName = `${configKeyName} ($${applicableThreshold.toFixed(2)})`;
      }
      if (nftType !== "Unknown" && nftId !== "UnknownNFTID") {
        console.log(
          `Sale ($${priceUSD.toFixed(
            2
          )}, type: ${collectionName}) did not meet criteria for any active bot (Effective Threshold: ~$${applicableThreshold.toFixed(
            2
          )} from ${thresholdName}). Tx: https://flowscan.io/transaction/${txId}`
        );
      }
    }
  } catch (err) {
    console.error(
      `Error in handleEvent for tx ${
        txId || event?.transactionId || "UNKNOWN"
      }:`,
      err
    );
  }
}
// --- End Main Event Handler ---

module.exports = { handleEvent };
