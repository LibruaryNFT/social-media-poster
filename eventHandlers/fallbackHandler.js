// eventHandlers/fallbackHandler.js
const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller");
const { getTransactionMetadata } = require("../metadata");

/**
 * handleFallback:
 * if none of the specialized NFT types match,
 * we parse buyer/seller from NonFungibleToken.Withdrawn/Deposited,
 * parse basic metadata, return tweet
 */
async function handleFallback({ event, txResults, displayPrice }) {
  const nftType = event.data?.nftType?.typeID || "UnknownNFTType";
  const nftId =
    event.data?.nftID ||
    event.data?.nftUUID ||
    event.data?.id ||
    "UnknownNFTID";

  // parse from NonFungibleToken
  const { seller: rawSeller, buyer } = parseBuyerSellerFromNonFungibleToken(
    txResults.events,
    nftType,
    nftId
  );

  let seller = rawSeller;
  const storeAddr = event.data?.storefrontAddress || "";
  if (seller === "UnknownSeller" && storeAddr) {
    seller = storeAddr;
  } else if (seller === "UnknownSeller" && event.data?.seller) {
    seller = event.data.seller;
  }

  // getTransactionMetadata => from your fallback logic (fcl.getTransaction)
  let txMetadata = {};
  try {
    txMetadata = await getTransactionMetadata(event.transactionId);
  } catch (err) {
    console.error("Error in fallback getTransactionMetadata:", err);
  }

  const nftName =
    txMetadata.name || event.data?.metadata?.name || "Unknown NFT";
  const imageUrl =
    txMetadata.imageUrl || event.data?.metadata?.imageUrl || null;

  const tweetText = `${displayPrice} SALE
${nftName}
Seller: ${seller}
Buyer: ${buyer}
https://flowscan.io/transaction/${event.transactionId}`;

  return { tweetText, imageUrl };
}

module.exports = {
  handleFallback,
};
