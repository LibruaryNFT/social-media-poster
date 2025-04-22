// eventHandlers/packNftHandler.js - UPDATED
// Generic handler for every PackNFT collection.
// Behaviour is driven by PACK_CONFIG — add a new entry to support more packs.

const { extractPackNFTMetadata } = require("../metadata");
const {
  parseBuyerSellerFromPackNFT,
  parseBuyerSellerFromNonFungibleToken,
} = require("./parseBuyerSeller");

/* ------------------------------------------------------------------ */
/* CONFIG TABLE                             */
/* ------------------------------------------------------------------ */
const PACK_CONFIG = [
  {
    contract: "A.0b2a3299cc857e29.PackNFT.NFT", // NBA Top Shot
    tag: "@NBATopShot",
    rewriteImage: (url) =>
      url
        .replace(
          "asset-preview.nbatopshot.com/packs",
          "assets.nbatopshot.com/resize/packs"
        )
        .replace(
          "assets.nbatopshot.com/packs",
          "assets.nbatopshot.com/resize/packs"
        ),
  },
  {
    contract: "A.e4cf4bdc1751c65d.PackNFT.NFT", // NFL ALL DAY
    tag: "@NFLALLDAY",
    rewriteImage: (url) =>
      url
        .replace(
          "assets.nflallday.com/tmp/",
          "assets.nflallday.com/resize/tmp/"
        )
        .replace(
          "assets.nflallday.com/packs/",
          "assets.nflallday.com/resize/packs/"
        ),
  },
  /* --- add more pack collections here if needed --- */
];

function getPackCfg(nftType) {
  return PACK_CONFIG.find((c) => c.contract === nftType);
}

/* ------------------------------------------------------------------ */

// UPDATED Signature: Accept new arguments
async function handlePackNFT({
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
      `PackNFT handler: Skipping tweet for tx ${event.transactionId} due to missing ID or Type. Type: ${type}, ID: ${id}`
    );
    return null;
  }

  const cfg = getPackCfg(type); // Use refined type to find config
  if (!cfg) {
    console.log(
      `PackNFT contract ${type} not in PACK_CONFIG; skipping specific pack handler.`
    );
    return null; // Let router fallback if necessary, though index.js logic should prevent this call if not enabled.
  }

  /* ---------- seller / buyer ---------- */
  let seller = event.data?.seller || "UnknownSeller";
  let buyer = event.data?.buyer || "UnknownBuyer";

  // Parsing logic remains the same, but uses refined type/id
  // 1) PackNFT.Withdraw / Deposit
  if (seller === "UnknownSeller" || buyer === "UnknownBuyer") {
    const p1 = parseBuyerSellerFromPackNFT(txResults.events, id);
    if (seller === "UnknownSeller") seller = p1.seller;
    if (buyer === "UnknownBuyer") buyer = p1.buyer;
  }
  // 2) NonFungibleToken.Withdrawn / Deposited (always exists)
  if (seller === "UnknownSeller" || buyer === "UnknownBuyer") {
    const p2 = parseBuyerSellerFromNonFungibleToken(
      txResults.events,
      type, // Use refined type
      id // Use refined ID
    );
    if (seller === "UnknownSeller") seller = p2.seller;
    if (buyer === "UnknownBuyer") buyer = p2.buyer;
  }

  /* ---------- metadata ---------- */
  let packName = "Unknown Pack";
  let rawImg = null;
  try {
    const metadata = await extractPackNFTMetadata(event.transactionId, id);
    packName = metadata.name || packName;
    rawImg = metadata.imageUrl || null;
  } catch (error) {
    console.error(
      `Error extracting PackNFT metadata for ID ${id} (Tx: ${event.transactionId}):`,
      error
    );
  }

  /* ---------- image shrink ---------- */
  let imageUrl = null;
  if (rawImg) {
    imageUrl = cfg.rewriteImage ? cfg.rewriteImage(rawImg) : rawImg;
    imageUrl += rawImg.includes("?") ? "&" : "?";
    imageUrl += "quality=100&width=500";
  }

  /* ---------- tweet ---------- */
  // Tweet text keeps the specific tag from PACK_CONFIG, ignoring marketplaceSource here.
  const tweetText = `${displayPrice} SALE on ${cfg.tag}
${packName}
Seller: ${seller}
Buyer: ${buyer}
https://flowscan.io/transaction/${event.transactionId}`;

  return { tweetText, imageUrl };
}

module.exports = { handlePackNFT };
