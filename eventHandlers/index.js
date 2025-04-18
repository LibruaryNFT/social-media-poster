// eventHandlers/index.js - UPDATED with Tx ID in log
const { getTransactionResults } = require("../flow");
const { postTweet } = require("../twitter");
const { logAllEvents } = require("./logger");

// Import specific handlers
const { handleTopShot } = require("./topShotHandler");
const { handlePackNFT } = require("./packNftHandler");
const { handleHotWheels } = require("./hotWheelsHandler");
const { handlePinnacle } = require("./pinnacleHandler");
const { handleFallback } = require("./fallbackHandler");

const { getFlowPrice } = require("../metadata");
const config = require("../config");

// Import the Twitter clients from the dedicated module
const { pinnacleBot, flowSalesBot } = require("../twitterClients");

// Define constants for NFT types for clarity
const PINNACLE_NFT_TYPE = "A.edf9df96c92f4595.Pinnacle.NFT";
const HW_CARD_TYPE = "A.d0bcefdf1e67ea85.HWGarageCardV2.NFT";
const HW_TOKEN_TYPE = "A.d0bcefdf1e67ea85.HWGarageTokenV2.NFT";
const TOPSHOT_PACK_CONTRACT = "A.0b2a3299cc857e29.PackNFT.NFT";
const NFL_PACK_CONTRACT = "A.e4cf4bdc1751c65d.PackNFT.NFT";
// Add TopShot Moment type if needed for logging/checks
const TOPSHOT_MOMENT_TYPE = "A.0b2a3299cc857e29.TopShot.NFT";

const isEnabled = (name) => config.ENABLED_COLLECTIONS.includes(name);

const FLOW_VAULT = "A.1654653399040a61.FlowToken.Vault";
const postedTxIds = new Set();

async function handleEvent(event) {
  if (!pinnacleBot || !flowSalesBot) {
    console.error(
      "Twitter clients not available in handleEvent. Aborting processing."
    );
    return;
  }
  const txId = event.transactionId; // Get txId early

  try {
    if (postedTxIds.has(txId)) {
      return;
    }

    const rawPrice = parseFloat(
      event.data?.salePrice || event.data?.price || "0"
    );
    const vaultType = event.data?.salePaymentVaultType || "";
    const evtType = event.type;

    let nftType = event.data?.nftType?.typeID || null;
    let nftId = event.data?.nftID || event.data?.id || null; // Also try to get ID early

    // If primary event lacks type info, try finding it in NonFungibleToken event later if needed
    // For now, just default to Unknown if missing here.
    nftType = nftType || "Unknown";

    /* ---------- flag detection ---------- */
    const isMomentSale =
      evtType.endsWith("TopShotMarketV2.MomentPurchased") ||
      evtType.endsWith("TopShotMarketV3.MomentPurchased") ||
      nftType === TOPSHOT_MOMENT_TYPE; // Add check here too

    const isPackNFT = nftType.endsWith(".PackNFT.NFT");
    const isTopShotPack = isPackNFT && nftType === TOPSHOT_PACK_CONTRACT;
    const isNflPack = isPackNFT && nftType === NFL_PACK_CONTRACT;

    const isHotWheels = nftType === HW_TOKEN_TYPE || nftType === HW_CARD_TYPE;
    const isPinnacle = nftType === PINNACLE_NFT_TYPE;
    // Ensure isGenericOther calculation reflects updated checks
    const isGenericOther =
      !isMomentSale &&
      !isPackNFT &&
      !isHotWheels &&
      !isPinnacle &&
      nftType !== "Unknown";

    /* ---------- collection mute check ---------- */
    if (
      (isMomentSale && !isEnabled("TOPSHOT_MOMENT")) ||
      (isTopShotPack && !isEnabled("TOPSHOT_PACK")) ||
      (isNflPack && !isEnabled("NFL_PACK")) ||
      (isHotWheels && !isEnabled("HOTWHEELS")) ||
      (isPinnacle && !isEnabled("PINNACLE")) ||
      // Only check GENERIC_OTHER enable if it's not one of the known types *and* the type isn't Unknown yet
      (isGenericOther && !isEnabled("GENERIC_OTHER")) ||
      // If type is still Unknown, let it pass for now, fallback handler checks GENERIC_OTHER later
      (nftType === "Unknown" && !isEnabled("GENERIC_OTHER")) // Check GENERIC_OTHER if type remains unknown
    ) {
      // Optional log: console.log(`Skipping disabled collection type: ${nftType} for tx: ${txId}`);
      return;
    }

    /* ---------- FLOW price + USD conversion ---------- */
    const flowUsd = await getFlowPrice();
    if (flowUsd === null) {
      console.error(
        `Could not get FLOW price for tx ${txId}, skipping USD conversion.`
      );
      return;
    }
    const priceUSD = vaultType === FLOW_VAULT ? rawPrice * flowUsd : rawPrice;

    /* ---------- skip non‑purchases or zero price ---------- */
    if (priceUSD <= 0) return; // Skip zero or negative price sales
    if (evtType.endsWith("OfferCompleted") && !event.data?.purchased) return;
    if (evtType.endsWith("ListingCompleted") && !event.data?.purchased) return;

    /* ---------- display price string ---------- */
    let displayPrice;
    if (vaultType === FLOW_VAULT && rawPrice > 0) {
      displayPrice = `${rawPrice} FLOW (~$${priceUSD.toFixed(2)} USD)`;
    } else if (rawPrice > 0) {
      const flowEq = priceUSD / flowUsd;
      displayPrice = `$${priceUSD.toFixed(2)} USD (~${flowEq.toFixed(2)} FLOW)`;
    } else {
      displayPrice = "$0.00 USD";
    }

    /* ---------- Check thresholds and dispatch to appropriate bot(s) ---------- */
    let tweetedPinnacle = false;
    let tweetedBigSale = false;
    let tweetRes = null;
    let txResults = null;

    const ensureTxResults = async () => {
      if (!txResults) {
        txResults = await getTransactionResults(txId);
        if (txResults?.events) {
          logAllEvents(txResults.events);
        } else {
          console.warn(`No events found in txResults for ${txId}`);
          txResults = { events: [] };
        }
      }
      // Try to refine nftType if it was Unknown, using txResults
      if (nftType === "Unknown" && txResults?.events?.length > 0) {
        for (const ev of txResults.events) {
          if (
            ev.type === "A.1d7e57aa55817448.NonFungibleToken.Deposited" ||
            ev.type === "A.1d7e57aa55817448.NonFungibleToken.Withdrawn"
          ) {
            try {
              const decoded = JSON.parse(
                Buffer.from(ev.payload, "base64").toString("utf-8")
              );
              const fields = decoded?.value?.fields || [];
              const typeField = fields.find((f) => f.name === "type");
              if (typeField?.value?.value) {
                nftType = typeField.value.value; // Found the type!
                console.log(`Refined nftType for tx ${txId} to: ${nftType}`);
                // Re-evaluate flags based on refined type if necessary
                // isPinnacle = nftType === PINNACLE_NFT_TYPE; // etc.
                break; // Stop searching once found
              }
            } catch (e) {
              /* ignore decode errors */
            }
          }
        }
      }
      return txResults;
    };

    // --- Check Pinnacle Bot Threshold ---
    // Re-check isPinnacle in case it was refined after ensureTxResults
    if (
      nftType === PINNACLE_NFT_TYPE &&
      priceUSD > config.PRICE_THRESHOLD_PINNACLE
    ) {
      console.log(
        `Pinnacle sale ($${priceUSD.toFixed(2)}) meets PinnacleBot threshold.`
      );
      await ensureTxResults();
      if (!tweetRes && txResults?.events?.length > 0) {
        tweetRes = await handlePinnacle({ event, txResults, displayPrice });
      }

      if (tweetRes?.tweetText) {
        try {
          console.log(`Tweeting Pinnacle sale to PinnacleBot...`);
          await postTweet(pinnacleBot, tweetRes.tweetText, tweetRes.imageUrl);
          tweetedPinnacle = true;
        } catch (error) {
          console.error("Error tweeting to PinnacleBot:", error);
        }
      }
    }

    // --- Check Big Sales Bot Threshold ---
    if (priceUSD > config.PRICE_THRESHOLD_BIGSALES) {
      // Log includes potentially refined nftType
      console.log(
        `Sale ($${priceUSD.toFixed(
          2
        )}, type: ${nftType}) meets BigSalesBot threshold.`
      );
      await ensureTxResults();

      if (!tweetRes && txResults?.events?.length > 0) {
        // Re-evaluate flags based on potentially refined type before dispatching
        const isMomentSaleRefined = nftType === TOPSHOT_MOMENT_TYPE;
        const isPackNFTRefined = nftType.endsWith(".PackNFT.NFT");
        const isHotWheelsRefined =
          nftType === HW_TOKEN_TYPE || nftType === HW_CARD_TYPE;
        const isPinnacleRefined = nftType === PINNACLE_NFT_TYPE; // Re-check

        if (isMomentSaleRefined)
          tweetRes = await handleTopShot({ event, txResults, displayPrice });
        else if (isPackNFTRefined)
          tweetRes = await handlePackNFT({ event, txResults, displayPrice });
        else if (isHotWheelsRefined)
          tweetRes = await handleHotWheels({ event, txResults, displayPrice });
        else if (isPinnacleRefined)
          // Should have been handled already unless thresholds differ significantly
          tweetRes = await handlePinnacle({ event, txResults, displayPrice });
        // Fallback if type is known but not specific, or still Unknown
        else
          tweetRes = await handleFallback({ event, txResults, displayPrice });
      }

      if (tweetRes?.tweetText) {
        try {
          console.log(`Tweeting big sale to FlowSalesBot...`);
          await postTweet(flowSalesBot, tweetRes.tweetText, tweetRes.imageUrl);
          tweetedBigSale = true;
        } catch (error) {
          console.error("Error tweeting to FlowSalesBot:", error);
        }
      } else if (!tweetRes) {
        console.warn(
          `Big sale threshold met for tx ${txId}, but no tweet content generated.`
        );
      }
    }

    // Add txId to posted set if it was tweeted by EITHER bot
    if (tweetedPinnacle || tweetedBigSale) {
      postedTxIds.add(txId);
      if (postedTxIds.size > 10000) {
        const oldestKeys = Array.from(postedTxIds).slice(0, 1000);
        oldestKeys.forEach((key) => postedTxIds.delete(key));
        console.log("Cleaned up postedTxIds set.");
      }
    } else if (priceUSD > 0) {
      // *** MODIFIED LOG LINE ***
      console.log(
        `Sale ($${priceUSD.toFixed(
          2
        )}, type: ${nftType}) did not meet criteria for any bot. Tx: https://flowscan.io/transaction/${txId}`
      );
      // ***********************
    }
  } catch (err) {
    // Include txId in error logging if available
    console.error(
      `Error in handleEvent for tx ${
        txId || event?.transactionId || "UNKNOWN"
      }:`,
      err
    );
  }
}

module.exports = { handleEvent };
