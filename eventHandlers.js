const { postTweet } = require("./twitter");
const {
  getTransactionMetadata,
  extractPackNFTMetadata,
} = require("./metadata");
const { PRICE_THRESHOLD_OTHERS, PRICE_THRESHOLD_TOPSHOT } = require("./config");

// Track posted TX in-memory
const postedTxIds = new Set();

/**
 * Main event handler
 */
async function handleEvent(event) {
  try {
    const txId = event.transactionId;

    // unify price
    const rawPrice = parseFloat(
      event.data?.salePrice || event.data?.price || "0"
    );

    // is it a TopShot event?
    const isTopShot =
      event.type.endsWith("TopShotMarketV2.MomentPurchased") ||
      event.type.endsWith("TopShotMarketV3.MomentPurchased");

    // which threshold to use?
    const threshold = isTopShot
      ? PRICE_THRESHOLD_TOPSHOT
      : PRICE_THRESHOLD_OTHERS;

    // If it's OffersV2.OfferCompleted with no purchase or zero price, skip
    if (event.type.endsWith("OfferCompleted")) {
      if (!event.data?.purchased || rawPrice === 0) return;
    }

    // If listingCompleted => purchased must be true => skip if not purchased
    if (event.type.endsWith("ListingCompleted") && !event.data?.purchased) {
      console.log("Listing is not purchased, skipping.");
      return;
    }

    // Check threshold
    if (rawPrice < threshold) {
      console.log(
        `Skipping sale: $${rawPrice.toFixed(
          2
        )} < threshold $${threshold.toFixed(2)} for ${event.type}`
      );
      return;
    }

    // Already posted?
    if (postedTxIds.has(txId)) {
      console.log(`Already tweeted tx ${txId}, skipping.`);
      return;
    }

    // Determine NFT type from event data
    const nftType = event.data?.nftType?.typeID || "UnknownNFTType";
    const isPackNFT = nftType.includes(".PackNFT.NFT");

    console.log(`Processing event with NFT type: ${nftType}`);
    console.log(`Is PackNFT? ${isPackNFT}`);

    // Then process
    const priceFmt = rawPrice.toFixed(2);

    if (isTopShot) {
      // TopShot-specific logic
      const id = event.data?.id || "UnknownID";
      const momentName = event.data?.momentName || "Unknown Moment";
      const seller = event.data?.seller || "UnknownSeller";

      let imageUrl = event.data?.momentThumbnailURL || null;
      if (!imageUrl && id !== "UnknownID") {
        imageUrl = `https://assets.nbatopshot.com/media/${id}/image?width=250&quality=100`;
      }

      const tweetText = `BIG SALE on @NBATopShot
Name: ${momentName}
ID: ${id}
Price: $${priceFmt}
Seller: ${seller}
Tx: https://flowscan.io/transaction/${txId}`;

      await postTweet(tweetText, imageUrl);
      postedTxIds.add(txId);
    } else if (isPackNFT) {
      // PackNFT logic
      const nftId =
        event.data?.nftID ||
        event.data?.nftUUID ||
        event.data?.id ||
        "UnknownNFTID";

      const metadata = await extractPackNFTMetadata(txId, nftId);

      const tweetText = `🔥 BIG SALE! 🔥
Name: ${metadata.name}
Type: ${nftType}
ID: ${nftId}
Price: $${priceFmt}
Tx: https://flowscan.io/transaction/${txId}`;

      await postTweet(tweetText, metadata.imageUrl);
      postedTxIds.add(txId);
    } else {
      // Standard NFT logic
      try {
        const txMetadata = await getTransactionMetadata(txId);

        const nftName =
          txMetadata.name || event.data?.metadata?.name || "Unknown NFT";
        const imageUrl =
          txMetadata.imageUrl || event.data?.metadata?.imageUrl || null;
        const nftId =
          event.data?.nftID ||
          event.data?.nftUUID ||
          event.data?.id ||
          "UnknownNFTID";

        const tweetText = `BIG SALE!
Name: ${nftName}
Type: ${nftType}
ID: ${nftId}
Price: $${priceFmt}
Tx: https://flowscan.io/transaction/${txId}`;

        await postTweet(tweetText, imageUrl);
        postedTxIds.add(txId);
      } catch (err) {
        console.error("Error processing standard NFT:", err);

        const nftId =
          event.data?.nftID ||
          event.data?.nftUUID ||
          event.data?.id ||
          "UnknownNFTID";

        const tweetText = `BIG SALE!
Name: Unknown NFT
Type: ${nftType}
ID: ${nftId}
Price: $${priceFmt}
Tx: https://flowscan.io/transaction/${txId}`;

        await postTweet(tweetText, null);
        postedTxIds.add(txId);
      }
    }
  } catch (err) {
    console.error("Error in handleEvent:", err);
  }
}

module.exports = {
  handleEvent,
};
