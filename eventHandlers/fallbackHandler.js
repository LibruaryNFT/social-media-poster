// eventHandlers/fallbackHandler.js - CORRECTED (Removes '../collections')
const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller");
// REMOVED: require('../collections')
const { getMetadata } = require("../metadata"); // Keep getMetadata

/**
 * handleFallback:
 * Handles generic NFT sales, including those from Flowty or standard NFTStorefrontV2,
 * when no specialized handler matches the NFT type.
 * Parses buyer/seller, fetches metadata, and constructs a tweet with marketplace info.
 */
async function handleFallback({
  event,
  txResults,
  displayPrice,
  marketplaceSource,
  nftType,
  nftId,
}) {
  // Use the passed nftType and nftId which might have been refined in index.js
  const type = nftType;
  const id = nftId;

  if (
    type === "UnknownNFTType" ||
    type === "Unknown" ||
    !id ||
    id === "UnknownNFTID"
  ) {
    console.warn(
      `Fallback handler: Skipping tweet for tx ${event.transactionId} due to unknown NFT type or missing ID. Type: ${type}, ID: ${id}`
    );
    return null; // Cannot proceed without type/ID
  }

  // Parse buyer/seller from NonFungibleToken events using refined type/id
  const { seller: rawSeller, buyer } = parseBuyerSellerFromNonFungibleToken(
    txResults.events,
    type, // Use refined type
    id // Use refined ID
  );

  // Attempt to determine seller, falling back to storefront address or event data
  let seller = rawSeller;
  const storeAddr = event.data?.storefrontAddress || ""; // Relevant for Storefront/Flowty events
  if (seller === "UnknownSeller" && storeAddr) {
    seller = storeAddr;
  } else if (seller === "UnknownSeller" && event.data?.seller) {
    seller = event.data.seller; // Fallback for OfferCompleted etc.
  }

  // Fetch metadata using the refined type and ID
  let metadata = null;
  // REMOVED: let collection = null;
  try {
    metadata = await getMetadata(type, id);
    // REMOVED: collection = findCollectionData(type);
  } catch (err) {
    console.error(
      // Updated error message slightly
      `Error fetching metadata for ${type} #${id} in fallback:`,
      err
    );
    // Decide if you want to attempt a tweet with minimal info or bail
  }

  // Determine NFT name, collection name, image URL, and external link
  const nftName = metadata?.name || `NFT #${id}`; // Use ID if name is missing

  // Derive collection name from the type string (e.g., A.xxxx.ContractName.NFT -> ContractName)
  let collectionName = "Unknown Collection";
  try {
    const parts = type.split(".");
    if (parts.length >= 3) {
      collectionName = parts[2]; // Get the contract name part
    }
  } catch (e) {
    /* Ignore errors deriving name */
  }

  const imageUrl = metadata?.thumbnail || null; // Use only NFT thumbnail from metadata
  const externalUrl =
    metadata?.externalURL || // Prefer NFT's external URL
    `https://flowscan.io/transaction/${event.transactionId}`; // Fallback to Flowscan

  // *** Add Marketplace Tag based on source ***
  let marketplaceTag = "";
  if (marketplaceSource === "Flowty") {
    marketplaceTag = " on @flowty_io";
  } else if (marketplaceSource === "NFTStorefrontV2") {
    // Optional: Add tag for the standard storefront if desired
    // marketplaceTag = " on NFTStorefront";
  } else if (marketplaceSource === "OffersV2") {
    marketplaceTag = " via Offer"; // Example tag for offers
  }
  // Add other specific marketplace source tags if needed

  // Construct tweet text
  const tweetText = `${nftName} (${collectionName}) bought for ${displayPrice}${marketplaceTag}! 🎉\n\nSeller: ${seller}\nBuyer: ${buyer}\n\n${externalUrl}`;

  return { tweetText, imageUrl };
}

module.exports = {
  handleFallback,
};
