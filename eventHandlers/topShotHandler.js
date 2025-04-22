// eventHandlers/topShotHandler.js - UPDATED
// Handles NBA Top Shot moment purchases.

const fs = require("fs");
const { fcl } = require("../flow");
const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller"); // Removed Buffer import

// Cadence script that returns MyTopShotData
const topShotCadence = fs.readFileSync("./flow/topshot.cdc", "utf-8");
const TOPSHOT_MOMENT_TYPE = "A.0b2a3299cc857e29.TopShot.NFT"; // Define constant

// UPDATED Signature: Accept new arguments
async function handleTopShot({
  event,
  txResults,
  displayPrice,
  marketplaceSource,
  nftType,
  nftId,
}) {
  // Use passed nftId and nftType directly
  const momentID = nftId;
  const type = nftType; // Should be TOPSHOT_MOMENT_TYPE

  if (!momentID || momentID === "UnknownID" || type !== TOPSHOT_MOMENT_TYPE) {
    console.warn(
      `TopShot handler: Skipping tweet for tx ${event.transactionId}. Incorrect type or missing ID. Type: ${type}, ID: ${momentID}`
    );
    return null;
  }

  /* ---------- seller / buyer via NFT Withdrawn/Deposited ---------- */
  // Use refined type/id for parsing
  const { seller: rawSeller, buyer: rawBuyer } =
    parseBuyerSellerFromNonFungibleToken(txResults.events, type, momentID);

  // Fallback logic remains the same
  const seller =
    rawSeller !== "UnknownSeller"
      ? rawSeller
      : event.data?.seller || "UnknownSeller"; // Event data seller useful for direct market V2/V3 sales
  const buyer =
    rawBuyer !== "UnknownBuyer"
      ? rawBuyer
      : event.data?.buyer || "UnknownBuyer"; // Event data buyer useful for direct market V2/V3 sales

  /* ---------- Cadence query ---------- */
  let meta = null; // Initialize as null
  try {
    // Ensure queryAddress is valid before querying
    const queryAddress =
      buyer !== "UnknownBuyer"
        ? buyer
        : seller !== "UnknownSeller"
        ? seller
        : null;
    if (!queryAddress) {
      throw new Error(
        "Cannot query TopShot script: No valid buyer or seller address found."
      );
    }
    meta = await fcl.query({
      cadence: topShotCadence,
      args: (arg, t) => [
        arg(queryAddress, t.Address), // Use valid address
        arg(String(momentID), t.UInt64), // Use refined ID
      ],
    });
  } catch (err) {
    console.error(
      `TopShot Cadence query failed for moment ${momentID} (Tx: ${event.transactionId}):`,
      err
    );
  }

  /* ---------- parse metadata fields (handle null meta object) ---------- */
  const seriesNumber = meta?.seriesNumber ?? null;
  const setName = meta?.setName ?? null;
  const fullName = meta?.fullName ?? null;
  const serialNumber = meta?.serialNumber ?? null;
  const numMomentsInEdition = meta?.numMomentsInEdition ?? null;
  const subedition = meta?.subedition ?? null;

  /* ---------- build image (use metadata first if available) ---------- */
  let imageUrl = meta?.thumbnail || null; // Try thumbnail from metadata first
  if (!imageUrl && momentID !== "UnknownID") {
    // Fallback to constructing URL if metadata lacks thumbnail but we have the ID
    imageUrl = `https://assets.nbatopshot.com/media/${momentID}/image?quality=100`;
  } else if (imageUrl) {
    // Add quality param if we got the URL from metadata
    imageUrl = `${imageUrl}${
      imageUrl.includes("?") ? "&" : "?"
    }quality=100&width=500`;
  }
  // If still no image, imageUrl remains null

  /* ---------- headline ---------- */
  const headline =
    fullName && setName && seriesNumber
      ? `${fullName} - ${setName} (Series ${seriesNumber})`
      : event.data?.momentName || `Top Shot Moment #${momentID}`; // Fallback to event data or ID

  /* ---------- sub‑edition line ---------- */
  const subLine =
    subedition && subedition !== "Standard" ? `\n${subedition}` : "";

  /* ---------- edition line ---------- */
  const editionLine =
    serialNumber != null && numMomentsInEdition != null // Check both are not null/undefined
      ? `\n${serialNumber} / ${numMomentsInEdition}`
      : "";

  /* ---------- tweet ---------- */
  // Keeps specific @NBATopShot tag, ignores marketplaceSource
  const tweetText = `${displayPrice} SALE on @NBATopShot
${headline}${subLine}${editionLine}
Seller: ${seller}
Buyer: ${buyer}
https://flowscan.io/transaction/${event.transactionId}`;

  return { tweetText, imageUrl };
}

module.exports = { handleTopShot };
