// eventHandlers/index.js
// Central router: converts FLOW→USD, enforces thresholds,
// respects ENABLED_COLLECTIONS, and dispatches to handlers.

const { getTransactionResults } = require("../flow");
const { postTweet } = require("../twitter");
const { logAllEvents } = require("./logger");

const { handleTopShot } = require("./topShotHandler");
const { handlePackNFT } = require("./packNftHandler");
const { handleHotWheels } = require("./hotWheelsHandler");
const { handlePinnacle } = require("./pinnacleHandler");
const { handleFallback } = require("./fallbackHandler");

const { getFlowPrice } = require("../metadata");
const {
  PRICE_THRESHOLD_OTHERS,
  PRICE_THRESHOLD_TOPSHOT,
  PRICE_THRESHOLD_TOPSHOT_PACKS,
  PRICE_THRESHOLD_NFL_PACKS,
  PRICE_THRESHOLD_HOTWHEELS,
  PRICE_THRESHOLD_PINNACLE,
  ENABLED_COLLECTIONS,
} = require("../config");

const isEnabled = (name) => ENABLED_COLLECTIONS.includes(name);

const FLOW_VAULT = "A.1654653399040a61.FlowToken.Vault";
const postedTxIds = new Set();

async function handleEvent(event) {
  try {
    const txId = event.transactionId;
    const rawPrice = parseFloat(
      event.data?.salePrice || event.data?.price || "0"
    );
    const vaultType = event.data?.salePaymentVaultType || "";
    const evtType = event.type;
    const nftType = event.data?.nftType?.typeID || "";

    /* ---------- flag detection ---------- */
    const isMomentSale =
      evtType.endsWith("TopShotMarketV2.MomentPurchased") ||
      evtType.endsWith("TopShotMarketV3.MomentPurchased");

    const isPackNFT = nftType.endsWith(".PackNFT.NFT");
    const isTopShotPack =
      isPackNFT && nftType.startsWith("A.0b2a3299cc857e29.");
    const isNflPack = isPackNFT && nftType.startsWith("A.e4cf4bdc1751c65d.");

    const isHotWheels =
      nftType === "A.d0bcefdf1e67ea85.HWGarageTokenV2.NFT" ||
      nftType === "A.d0bcefdf1e67ea85.HWGarageCardV2.NFT";

    const isPinnacle = nftType === "A.edf9df96c92f4595.Pinnacle.NFT";

    /* ---------- collection mute check ---------- */
    if (
      (isMomentSale && !isEnabled("TOPSHOT_MOMENT")) ||
      (isTopShotPack && !isEnabled("TOPSHOT_PACK")) ||
      (isNflPack && !isEnabled("NFL_PACK")) ||
      (isHotWheels && !isEnabled("HOTWHEELS")) ||
      (isPinnacle && !isEnabled("PINNACLE")) ||
      (!isMomentSale &&
        !isPackNFT &&
        !isHotWheels &&
        !isPinnacle &&
        !isEnabled("GENERIC_OTHER"))
    )
      return;

    /* ---------- FLOW price + USD conversion ---------- */
    const flowUsd = await getFlowPrice();
    const priceUSD = vaultType === FLOW_VAULT ? rawPrice * flowUsd : rawPrice;

    /* ---------- skip non‑purchases ---------- */
    if (
      evtType.endsWith("OfferCompleted") &&
      (!event.data?.purchased || priceUSD === 0)
    )
      return;
    if (evtType.endsWith("ListingCompleted") && !event.data?.purchased) return;

    /* ---------- choose threshold ---------- */
    const threshold = isMomentSale
      ? PRICE_THRESHOLD_TOPSHOT
      : isTopShotPack
      ? PRICE_THRESHOLD_TOPSHOT_PACKS
      : isNflPack
      ? PRICE_THRESHOLD_NFL_PACKS
      : isHotWheels
      ? PRICE_THRESHOLD_HOTWHEELS
      : isPinnacle
      ? PRICE_THRESHOLD_PINNACLE
      : PRICE_THRESHOLD_OTHERS;

    if (priceUSD < threshold) return;
    if (postedTxIds.has(txId)) return;

    /* ---------- display price string ---------- */
    let displayPrice;
    if (vaultType === FLOW_VAULT) {
      displayPrice = `${rawPrice} FLOW (~$${priceUSD.toFixed(2)})`;
    } else {
      const flowEq = priceUSD / flowUsd;
      displayPrice = `$${priceUSD.toFixed(2)} (~${flowEq.toFixed(2)} FLOW)`;
    }

    /* ---------- tx results & log ---------- */
    const txResults = await getTransactionResults(txId);
    if (!txResults?.events) return;
    logAllEvents(txResults.events);

    /* ---------- dispatch ---------- */
    let tweetRes;
    if (isMomentSale)
      tweetRes = await handleTopShot({ event, txResults, displayPrice });
    else if (isPackNFT)
      tweetRes = await handlePackNFT({ event, txResults, displayPrice });
    else if (isHotWheels)
      tweetRes = await handleHotWheels({ event, txResults, displayPrice });
    else if (isPinnacle)
      tweetRes = await handlePinnacle({ event, txResults, displayPrice });
    else tweetRes = await handleFallback({ event, txResults, displayPrice });

    if (tweetRes?.tweetText) {
      await postTweet(tweetRes.tweetText, tweetRes.imageUrl);
      postedTxIds.add(txId);
    }
  } catch (err) {
    console.error("Error in handleEvent:", err);
  }
}

module.exports = { handleEvent };
