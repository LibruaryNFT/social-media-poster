// eventHandlers/packNftHandler.js
// Generic handler for every PackNFT collection.
// Behaviour is driven by PACK_CONFIG — add a new entry to support more packs.

const { extractPackNFTMetadata } = require("../metadata");
const {
  parseBuyerSellerFromPackNFT,
  parseBuyerSellerFromNonFungibleToken,
} = require("./parseBuyerSeller");

/* ------------------------------------------------------------------ */
/*                           CONFIG TABLE                             */
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

async function handlePackNFT({ event, txResults, displayPrice }) {
  const nftId = event.data?.nftID || event.data?.id || "UnknownNFTID";
  const nftType = event.data?.nftType?.typeID;

  const cfg = getPackCfg(nftType);
  if (!cfg) {
    console.log("PackNFT contract not in PACK_CONFIG; skipping.");
    return null; // let router fallback
  }

  /* ---------- seller / buyer ---------- */
  let seller = event.data?.seller || "UnknownSeller";
  let buyer = event.data?.buyer || "UnknownBuyer";

  // 1) PackNFT.Withdraw / Deposit
  if (seller === "UnknownSeller" || buyer === "UnknownBuyer") {
    const p1 = parseBuyerSellerFromPackNFT(txResults.events, nftId);
    if (seller === "UnknownSeller") seller = p1.seller;
    if (buyer === "UnknownBuyer") buyer = p1.buyer;
  }
  // 2) NonFungibleToken.Withdrawn / Deposited (always exists)
  if (seller === "UnknownSeller" || buyer === "UnknownBuyer") {
    const p2 = parseBuyerSellerFromNonFungibleToken(
      txResults.events,
      nftType,
      nftId
    );
    if (seller === "UnknownSeller") seller = p2.seller;
    if (buyer === "UnknownBuyer") buyer = p2.buyer;
  }

  /* ---------- metadata ---------- */
  const { name: packName = "Unknown Pack", imageUrl: rawImg } =
    await extractPackNFTMetadata(event.transactionId, nftId);

  /* ---------- image shrink ---------- */
  let imageUrl = null;
  if (rawImg) {
    imageUrl = cfg.rewriteImage ? cfg.rewriteImage(rawImg) : rawImg;
    imageUrl += rawImg.includes("?") ? "&" : "?";
    imageUrl += "quality=100&width=500";
  }

  /* ---------- tweet ---------- */
  const tweetText = `${displayPrice} SALE on ${cfg.tag}
${packName}
Seller: ${seller}
Buyer: ${buyer}
https://flowscan.io/transaction/${event.transactionId}`;

  return { tweetText, imageUrl };
}

module.exports = { handlePackNFT };
