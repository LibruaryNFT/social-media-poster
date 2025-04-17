// eventHandlers/hotWheelsHandler.js
// Handles Hot Wheels Virtual Garage cards & tokens.

const fs = require("fs");
const { fcl } = require("../flow");

const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller");

// Cadence script that returns MyHotWheelsData
const hotWheelsCadence = fs.readFileSync("./flow/hotwheels.cdc", "utf-8");

// All Hot Wheels NFT types we support
const HW_CARD_TYPE = "A.d0bcefdf1e67ea85.HWGarageCardV2.NFT";
const HW_TOKEN_TYPE = "A.d0bcefdf1e67ea85.HWGarageTokenV2.NFT";

async function handleHotWheels({ event, txResults, displayPrice }) {
  const nftId = event.data?.nftID || event.data?.id || "UnknownNFTID";
  const nftType = event.data?.nftType?.typeID;

  /* ---------- seller / buyer via NFT Withdrawn/Deposited ---------- */
  const { seller: rawSeller, buyer: rawBuyer } =
    parseBuyerSellerFromNonFungibleToken(txResults.events, nftType, nftId);

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
  if (nftType === HW_CARD_TYPE) {
    try {
      hw = await fcl.query({
        cadence: hotWheelsCadence,
        args: (arg, t) => [
          arg(buyer !== "UnknownBuyer" ? buyer : seller, t.Address),
          arg(String(nftId), t.UInt64),
        ],
      });
    } catch (err) {
      console.error("HotWheels Cadence query failed:", err);
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
    headline = "Hot Wheels Virtual Garage";
  }

  /* External viewer link for cards */
  const link =
    nftType === HW_CARD_TYPE
      ? `https://virtual.mattel.com/token/FLOW:A.d0bcefdf1e67ea85.HWGarageCardV2:${nftId}`
      : `https://flowscan.io/transaction/${event.transactionId}`;

  const tweetText = `${displayPrice} SALE on @Hot_Wheels Virtual Garage
${headline}
Seller: ${seller}
Buyer: ${buyer}
${link}`;

  return { tweetText, imageUrl: null };
}

module.exports = { handleHotWheels };
