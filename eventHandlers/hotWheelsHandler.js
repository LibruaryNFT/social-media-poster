// eventHandlers/hotWheelsHandler.js - UPDATED
// Handles Hot Wheels Virtual Garage cards & tokens.

const fs = require("fs");
const { fcl } = require("../flow");

const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller");

// Cadence script that returns MyHotWheelsData
const hotWheelsCadence = fs.readFileSync("./flow/hotwheels.cdc", "utf-8");

// All Hot Wheels NFT types we support
const HW_CARD_TYPE = "A.d0bcefdf1e67ea85.HWGarageCardV2.NFT";
const HW_TOKEN_TYPE = "A.d0bcefdf1e67ea85.HWGarageTokenV2.NFT";

// UPDATED Signature: Accept new arguments
async function handleHotWheels({
  event,
  txResults,
  displayPrice,
  marketplaceSource,
  nftType,
  nftId,
}) {
  // Use passed nftId and nftType directly
  const id = nftId;
  const type = nftType;

  if (!id || id === "UnknownNFTID" || !type) {
    console.warn(
      `HotWheels handler: Skipping tweet for tx ${event.transactionId} due to missing ID or Type. Type: ${type}, ID: ${id}`
    );
    return null;
  }

  /* ---------- seller / buyer via NFT Withdrawn/Deposited ---------- */
  // Use refined type/id for parsing
  const { seller: rawSeller, buyer: rawBuyer } =
    parseBuyerSellerFromNonFungibleToken(txResults.events, type, id);

  // Fallback logic for seller/buyer remains the same
  const seller =
    rawSeller !== "UnknownSeller"
      ? rawSeller
      : event.data?.seller || "UnknownSeller";
  const buyer =
    rawBuyer !== "UnknownBuyer"
      ? rawBuyer
      : event.data?.buyer || "UnknownBuyer";

  /* ---------- Cadence query (only for CardV2) ---------- */
  let hw = null;
  if (type === HW_CARD_TYPE) {
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
          "Cannot query HotWheels script: No valid buyer or seller address found."
        );
      }
      hw = await fcl.query({
        cadence: hotWheelsCadence,
        args: (arg, t) => [
          arg(queryAddress, t.Address), // Use valid address
          arg(String(id), t.UInt64), // Use refined ID
        ],
      });
    } catch (err) {
      console.error(
        `HotWheels Cadence query failed for NFT ${id} (Tx: ${event.transactionId}):`,
        err
      );
    }
  }

  /* ---------- tweet text ---------- */
  let headline;
  if (hw) {
    // Example: "2023 Series Completion - Exclusive - #56"
    const mint = hw.mint ?? null;
    const mini = hw.miniCollection ?? "";
    const rarity = hw.rarity ?? "";
    const mintStr = mint !== null ? ` - #${mint}` : "";
    headline = `${mini} - ${rarity}${mintStr}`;
  } else {
    // Fallback headline uses the type if known
    headline =
      type === HW_CARD_TYPE
        ? "Hot Wheels Card"
        : type === HW_TOKEN_TYPE
        ? "Hot Wheels Token"
        : "Hot Wheels Virtual Garage";
  }

  /* External viewer link for cards */
  const link =
    type === HW_CARD_TYPE
      ? `https://virtual.mattel.com/token/FLOW:${type.split(".")[0]}.${
          type.split(".")[1]
        }.${type.split(".")[2]}:${id}` // Use type parts
      : `https://flowscan.io/transaction/${event.transactionId}`;

  // Tweet text keeps the specific @Hot_Wheels tag, ignoring marketplaceSource here.
  const tweetText = `${displayPrice} SALE on @Hot_Wheels Virtual Garage
${headline}
Seller: ${seller}
Buyer: ${buyer}
${link}`;

  return { tweetText, imageUrl: null }; // Hot Wheels usually doesn't have easily accessible images via script
}

module.exports = { handleHotWheels };
