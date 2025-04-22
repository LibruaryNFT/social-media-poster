// eventHandlers/allDayHandler.js - UPDATED FILENAME & FUNCTION NAME
// Handles NFL ALL DAY Moment sales.

const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller");
const { getMetadata } = require("../metadata"); // Use generic metadata fetcher

const NFL_ALLDAY_NFT_TYPE = "A.e4cf4bdc1751c65d.AllDay.NFT"; // Define constant

// *** Renamed function ***
async function handleAllDay({
  event,
  txResults,
  displayPrice,
  marketplaceSource,
  nftType,
  nftId,
}) {
  // Use passed nftId and nftType directly
  const id = nftId;
  const type = nftType; // Should be NFL_ALLDAY_NFT_TYPE

  if (!id || id === "UnknownNFTID" || type !== NFL_ALLDAY_NFT_TYPE) {
    console.warn(
      `All Day handler: Skipping tweet for tx ${event.transactionId}. Incorrect type or missing ID. Type: ${type}, ID: ${id}`
    );
    return null;
  }

  /* ---------- seller / buyer ---------- */
  const { seller: parsedSeller, buyer: parsedBuyer } =
    parseBuyerSellerFromNonFungibleToken(txResults.events, type, id);
  const seller =
    parsedSeller !== "UnknownSeller"
      ? parsedSeller
      : event.data?.seller || event.data?.storefrontAddress || "UnknownSeller";
  const buyer =
    parsedBuyer !== "UnknownBuyer"
      ? parsedBuyer
      : event.data?.buyer || "UnknownBuyer";

  /* ---------- fetch metadata (name, thumbnail) ---------- */
  let metadata = null;
  let nftName = `NFL ALL DAY Moment #${id}`; // Default name
  let imageUrl = null;
  try {
    metadata = await getMetadata(type, id);
    if (metadata?.name) {
      nftName = metadata.name;
    }
    imageUrl = metadata?.thumbnail || null;
  } catch (error) {
    console.error(
      `Error fetching metadata for ${type} #${id} in handleAllDay:`,
      error
    );
  }

  /* ---------- Construct URL ---------- */
  const nflAllDayUrl = `https://nflallday.com/moments/${id}`;

  /* ---------- Construct Tweet ---------- */
  const tweetText = `${nftName} bought for ${displayPrice} on @NFLALLDAY! 🏈\n\nSeller: ${seller}\nBuyer: ${buyer}\n\n${nflAllDayUrl}`;

  return { tweetText, imageUrl };
}

// *** Updated module exports ***
module.exports = { handleAllDay };
