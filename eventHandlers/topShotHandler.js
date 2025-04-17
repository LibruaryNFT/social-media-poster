// eventHandlers/topShotHandler.js
// Handles NBA Top Shot moment purchases.

const fs = require("fs");
const { fcl } = require("../flow");
const Buffer = require("buffer").Buffer;
const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller");

// Cadence script that returns MyTopShotData
const topShotCadence = fs.readFileSync("./flow/topshot.cdc", "utf-8");

async function handleTopShot({ event, txResults, displayPrice }) {
  const momentID = event.data?.id || "UnknownID";
  const nftType = "A.0b2a3299cc857e29.TopShot.NFT";

  /* ---------- seller / buyer via NFT Withdrawn/Deposited ---------- */
  const { seller: rawSeller, buyer: rawBuyer } =
    parseBuyerSellerFromNonFungibleToken(txResults.events, nftType, momentID);

  const seller =
    rawSeller !== "UnknownSeller"
      ? rawSeller
      : event.data?.seller || "UnknownSeller";
  const buyer =
    rawBuyer !== "UnknownBuyer"
      ? rawBuyer
      : event.data?.buyer || "UnknownBuyer";

  /* ---------- Cadence query ---------- */
  let meta;
  try {
    meta = await fcl.query({
      cadence: topShotCadence,
      args: (arg, t) => [
        arg(buyer !== "UnknownBuyer" ? buyer : seller, t.Address),
        arg(String(momentID), t.UInt64),
      ],
    });
  } catch (err) {
    console.error("TopShot Cadence query failed:", err);
  }

  /* ---------- fallback fields ---------- */
  const seriesNumber = meta?.seriesNumber ?? null;
  const setName = meta?.setName ?? null;
  const fullName = meta?.fullName ?? null;
  const serialNumber = meta?.serialNumber ?? null;
  const numMomentsInEdition = meta?.numMomentsInEdition ?? null;
  const subedition = meta?.subedition ?? null;

  const nameFromEvent = event.data?.momentName || "Unknown NFT";
  const thumbFromEvent = event.data?.momentThumbnailURL || null;

  /* ---------- build image ---------- */
  let imageUrl = null;
  if (momentID !== "UnknownID") {
    imageUrl = `https://assets.nbatopshot.com/media/${momentID}/image?quality=100`;
  } else if (thumbFromEvent) {
    imageUrl = `${thumbFromEvent}?quality=100&width=500`;
  }

  /* ---------- headline ---------- */
  const headline =
    fullName && setName && seriesNumber
      ? `${fullName} - ${setName} (Series ${seriesNumber})`
      : nameFromEvent;

  /* ---------- sub‑edition line ---------- */
  const subLine =
    subedition && subedition !== "Standard" ? `\n${subedition}` : "";

  /* ---------- edition line ---------- */
  const editionLine =
    serialNumber && numMomentsInEdition
      ? `\n${serialNumber} / ${numMomentsInEdition}`
      : "";

  /* ---------- tweet ---------- */
  const tweetText = `${displayPrice} SALE on @NBATopShot
${headline}${subLine}${editionLine}
Seller: ${seller}
Buyer: ${buyer}
https://flowscan.io/transaction/${event.transactionId}`;

  return { tweetText, imageUrl };
}

module.exports = { handleTopShot };
