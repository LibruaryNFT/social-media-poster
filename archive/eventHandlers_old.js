// eventHandlers.js

const fs = require("fs");
const { postTweet } = require("../twitter");
const {
  getTransactionMetadata,
  extractPackNFTMetadata,
} = require("../metadata");
const {
  PRICE_THRESHOLD_OTHERS,
  PRICE_THRESHOLD_TOPSHOT,
} = require("../config");
const { fcl, getTransactionResults } = require("../flow");
const Buffer = require("buffer").Buffer;

// Track posted TX in memory
const postedTxIds = new Set();

// Load scripts once at module level
const flowPriceCadence = fs.readFileSync("./flow/flowprice.cdc", "utf-8");
const hotwheelsCadence = fs.readFileSync("./flow/hotwheels.cdc", "utf-8");
const topShotCadence = fs.readFileSync("./flow/topshot.cdc", "utf-8");

/**
 * decodeEventPayloadBase64: parse event.payload from base64 -> JSON
 */
function decodeEventPayloadBase64(payloadBase64) {
  try {
    const buff = Buffer.from(payloadBase64, "base64");
    return JSON.parse(buff.toString("utf-8"));
  } catch {
    return null;
  }
}

/**
 * getFlowPrice: calls your public oracle script, flowprice.cdc
 */
async function getFlowPrice() {
  try {
    const result = await fcl.query({
      cadence: flowPriceCadence,
      args: (arg, t) => [arg("0xe385412159992e11", t.Address)],
    });
    // e.g. [0.34947326, 1234567, 1744236214]
    if (!Array.isArray(result) || result.length < 1) {
      throw new Error("Invalid flowprice.cdc result");
    }
    return parseFloat(result[0].toFixed(2));
  } catch (err) {
    console.error("Error fetching FLOW price:", err);
    return null;
  }
}

/**
 * getTopShotData: calls your topshot.cdc script
 */
async function getTopShotData(address, momentID) {
  try {
    const result = await fcl.query({
      cadence: topShotCadence,
      args: (arg, t) => [
        arg(address, t.Address),
        arg(String(momentID), t.UInt64),
      ],
    });
    return result; // { seriesNumber, setName, fullName, ... }
  } catch (err) {
    console.error("Error querying TopShot script:", err);
    return null;
  }
}

/**
 * getHotWheelsData: calls your hotwheels.cdc script for HWGarageTokenV2
 */
async function getHotWheelsData(ownerAddr, nftID) {
  try {
    const result = await fcl.query({
      cadence: hotwheelsCadence,
      args: (arg, t) => [
        arg(ownerAddr, t.Address),
        arg(String(nftID), t.UInt64),
      ],
    });
    return result; // { series, rarity, miniCollection, typeField, releaseYear, etc. }
  } catch (err) {
    console.error("Error querying hotwheels.cdc script:", err);
    return null;
  }
}

/**
 * getPinnacleData: if you have a Pinnacle script
 */
async function getPinnacleData(ownerAddr, nftID) {
  try {
    const cadence = fs.readFileSync(
      "./pinnacle/scripts/get_pin_data_relevant.cdc",
      "utf-8"
    );
    const result = await fcl.query({
      cadence,
      args: (arg, t) => [
        arg(ownerAddr, t.Address),
        arg(String(nftID), t.UInt64),
      ],
    });
    return result;
  } catch (err) {
    console.error("Error querying Pinnacle script:", err);
    return null;
  }
}

/**
 * Main event handler
 */
async function handleEvent(event) {
  try {
    const txId = event.transactionId;
    const rawPrice = parseFloat(
      event.data?.salePrice || event.data?.price || "0"
    );
    const salePaymentVaultType = event.data?.salePaymentVaultType || "";

    // If it's a TopShot event
    const isTopShot =
      event.type.endsWith("TopShotMarketV2.MomentPurchased") ||
      event.type.endsWith("TopShotMarketV3.MomentPurchased");

    // Which threshold
    const threshold = isTopShot
      ? PRICE_THRESHOLD_TOPSHOT
      : PRICE_THRESHOLD_OTHERS;

    // skip if OfferCompleted => not purchased or zero price
    if (event.type.endsWith("OfferCompleted")) {
      if (!event.data?.purchased || rawPrice === 0) return;
    }
    // skip if ListingCompleted => not purchased
    if (event.type.endsWith("ListingCompleted") && !event.data?.purchased) {
      console.log("Listing not purchased, skipping.");
      return;
    }

    // price threshold check
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

    // Identify NFT type
    const nftType = event.data?.nftType?.typeID || "UnknownNFTType";
    const isPackNFT = nftType.includes(".PackNFT.NFT");
    console.log(`Processing event with NFT type: ${nftType}`);
    console.log(`Is PackNFT? ${isPackNFT}`);

    // Possibly show Flow + USD
    let displayPriceUsd = rawPrice;
    let flowPriceText = "";
    if (salePaymentVaultType === "A.1654653399040a61.FlowToken.Vault") {
      // e.g. user pays in FLOW
      const flowUsd = await getFlowPrice();
      if (flowUsd) {
        displayPriceUsd = rawPrice * flowUsd;
        flowPriceText = `${rawPrice} FLOW (~$${displayPriceUsd.toFixed(2)})`;
      } else {
        flowPriceText = `${rawPrice} FLOW (no USD data)`;
      }
    }
    const displayPrice = flowPriceText
      ? flowPriceText
      : `$${rawPrice.toFixed(2)}`;

    //
    // 1) If top shot
    //
    if (isTopShot) {
      const momentID = event.data?.id || "UnknownID";
      const seller = event.data?.seller || "UnknownSeller";

      // parse deposit => find buyer
      const txResults = await getTransactionResults(txId);
      let buyerAddress = null;
      if (txResults?.events) {
        for (const evt of txResults.events) {
          if (
            evt.type === "A.0b2a3299cc857e29.TopShot.Deposit" &&
            evt.payload
          ) {
            const decoded = decodeEventPayloadBase64(evt.payload);
            if (decoded?.id && decoded.id == momentID) {
              buyerAddress = decoded.to;
              console.log(
                `TopShot deposit => momentID=${momentID}, to=${buyerAddress}`
              );
              break;
            }
          }
        }
      }
      if (!buyerAddress) {
        // fallback
        buyerAddress = event.data?.buyer || event.data?.owner || seller;
      }

      if (!buyerAddress) {
        // minimal fallback tweet
        const fallback = `${displayPrice} SALE on @NBATopShot
Seller: ${seller}
https://flowscan.io/transaction/${txId}`;
        await postTweet(fallback, null);
        postedTxIds.add(txId);
        return;
      }

      // advanced data
      const topShotData = await getTopShotData(buyerAddress, momentID);
      if (!topShotData) {
        const fallback2 = `${displayPrice} SALE on @NBATopShot
Seller: ${seller}
https://flowscan.io/transaction/${txId}`;
        await postTweet(fallback2, null);
        postedTxIds.add(txId);
        return;
      }

      const {
        seriesNumber,
        setName,
        fullName,
        serialNumber,
        numMomentsInEdition,
      } = topShotData;

      // build moment image url
      const imageUrl =
        momentID !== "UnknownID"
          ? `https://assets.nbatopshot.com/media/${momentID}/image?quality=100`
          : null;

      const tweetText = `${displayPrice} SALE on @NBATopShot
Series #${seriesNumber} - ${setName} - ${fullName}
${serialNumber} / ${numMomentsInEdition}
Seller: ${seller}
https://flowscan.io/transaction/${txId}`;

      await postTweet(tweetText, imageUrl);
      postedTxIds.add(txId);

      //
      // 2) PackNFT
      //
    } else if (isPackNFT) {
      const nftId =
        event.data?.nftID ||
        event.data?.nftUUID ||
        event.data?.id ||
        "UnknownNFTID";

      let seller = "UnknownSeller";
      let buyer = "UnknownBuyer";

      // parse deposit/withdraw from transaction results
      const txResults = await getTransactionResults(txId);
      if (txResults?.events) {
        console.log(
          "Scanning events for PackNFT deposit/withdraw => buyer/seller..."
        );
        for (const evt of txResults.events) {
          const decoded = evt.payload
            ? decodeEventPayloadBase64(evt.payload)
            : null;
          if (
            evt.type === "A.0b2a3299cc857e29.PackNFT.Withdraw" &&
            decoded?.id == nftId
          ) {
            seller = decoded.from || seller;
            console.log(`Found PackNFT.Withdraw => seller=${seller}`);
          }
          if (
            evt.type === "A.0b2a3299cc857e29.PackNFT.Deposit" &&
            decoded?.id == nftId
          ) {
            buyer = decoded.to || buyer;
            console.log(`Found PackNFT.Deposit => buyer=${buyer}`);
          }
        }
      }
      // fallback if still unknown
      if (seller === "UnknownSeller") {
        const storeAddr = event.data?.storefrontAddress || "";
        if (storeAddr) seller = storeAddr;
        else if (event.data?.seller) seller = event.data.seller;
      }

      // get pack metadata
      const metadata = await extractPackNFTMetadata(txId, nftId);

      // transform the imageUrl if needed
      let finalImageUrl = null;
      if (metadata.imageUrl) {
        if (metadata.imageUrl.includes("asset-preview.nbatopshot.com/packs")) {
          // transform to "https://assets.nbatopshot.com/resize/packs/... ?quality=100&width=500&cv=1"
          finalImageUrl = metadata.imageUrl.replace(
            "asset-preview.nbatopshot.com/packs",
            "assets.nbatopshot.com/resize/packs"
          );
          finalImageUrl += "?quality=100&width=500&cv=1";
        } else {
          // fallback
          if (metadata.imageUrl.includes("?")) {
            finalImageUrl = `${metadata.imageUrl}&quality=100&width=500`;
          } else {
            finalImageUrl = `${metadata.imageUrl}?quality=100&width=500`;
          }
        }
      }

      const tweetText = `${displayPrice} SALE on @NBATopShot
${metadata.name}
Seller: ${seller}
Buyer: ${buyer}
https://flowscan.io/transaction/${txId}`;

      await postTweet(tweetText, finalImageUrl);
      postedTxIds.add(txId);

      //
      // 3) Pinnacle
      //
    } else if (nftType === "A.edf9df96c92f4595.Pinnacle.NFT") {
      const nftId =
        event.data?.nftID ||
        event.data?.nftUUID ||
        event.data?.id ||
        "UnknownNFTID";
      const storeAddr = event.data?.storefrontAddress || "";
      let seller = event.data?.seller || "UnknownSeller";
      if (storeAddr) {
        seller = storeAddr;
      }

      const pinData = await getPinnacleData(seller, nftId);
      if (!pinData) {
        const fallback = `${displayPrice} SALE on @DisneyPinnacle
Unknown NFT
Seller: ${seller}
https://flowscan.io/transaction/${txId}`;
        await postTweet(fallback, null);
        postedTxIds.add(txId);
        return;
      }

      // parse fields
      let editionName = "Unknown Edition";
      let maxSupply = "N/A";
      let editionNumber = "N/A";
      if (pinData.editions && pinData.editions.length > 0) {
        editionName = pinData.editions[0].name;
        if (pinData.editions[0].max != null) {
          maxSupply = pinData.editions[0].max.toString();
        }
        editionNumber = pinData.editions[0].number.toString();
      }

      let variantValue = "N/A";
      for (const trait of pinData.traits) {
        if (trait.name === "Variant") {
          variantValue = trait.value?.toString() || "Standard";
        }
      }

      const tweetText = `${displayPrice} SALE on @DisneyPinnacle
${editionName}
#${editionNumber} / ${maxSupply}
Variant: ${variantValue}
Seller: ${seller}
https://flowscan.io/transaction/${txId}`;

      await postTweet(tweetText, null);
      postedTxIds.add(txId);

      //
      // 4) HotWheels: A.d0bcefdf1e67ea85.HWGarageTokenV2.NFT
      //
    } else if (nftType === "A.d0bcefdf1e67ea85.HWGarageTokenV2.NFT") {
      // parse deposit/withdraw from NonFungibleToken
      const txResults = await getTransactionResults(txId);

      let seller = "UnknownSeller";
      let buyer = "UnknownBuyer";
      const nftId =
        event.data?.nftID ||
        event.data?.nftUUID ||
        event.data?.id ||
        "UnknownNFTID";

      if (txResults?.events) {
        for (const evt of txResults.events) {
          const decoded = evt.payload
            ? decodeEventPayloadBase64(evt.payload)
            : null;
          if (
            evt.type === "A.1d7e57aa55817448.NonFungibleToken.Withdrawn" &&
            decoded
          ) {
            const fields = decoded.value?.fields || [];
            let eventTypeString = "";
            let eventIdString = "";
            let eventFromString = "";
            for (const f of fields) {
              if (f.name === "type" && typeof f.value?.value === "string") {
                eventTypeString = f.value.value;
              }
              if (f.name === "id" && typeof f.value?.value === "string") {
                eventIdString = f.value.value;
              }
              if (f.name === "from" && typeof f.value?.value === "string") {
                eventFromString = f.value.value;
              }
            }
            if (
              eventTypeString === nftType &&
              eventIdString === String(nftId)
            ) {
              seller = eventFromString || seller;
            }
          }
          if (
            evt.type === "A.1d7e57aa55817448.NonFungibleToken.Deposited" &&
            decoded
          ) {
            const fields = decoded.value?.fields || [];
            let eventTypeString = "";
            let eventIdString = "";
            let eventToString = "";
            for (const f of fields) {
              if (f.name === "type" && typeof f.value?.value === "string") {
                eventTypeString = f.value.value;
              }
              if (f.name === "id" && typeof f.value?.value === "string") {
                eventIdString = f.value.value;
              }
              if (f.name === "to" && typeof f.value?.value === "string") {
                eventToString = f.value.value;
              }
            }
            if (
              eventTypeString === nftType &&
              eventIdString === String(nftId)
            ) {
              buyer = eventToString || buyer;
            }
          }
        }
      }

      // fallback storeAddr or event.data.seller
      const storeAddr = event.data?.storefrontAddress || "";
      if (seller === "UnknownSeller" && storeAddr) {
        seller = storeAddr;
      } else if (seller === "UnknownSeller" && event.data?.seller) {
        seller = event.data.seller;
      }

      // call hotwheels script
      const hwData = await getHotWheelsData(seller, nftId);
      // if minted to buyer, you might do getHotWheelsData(buyer, nftId)

      if (!hwData) {
        const fallbackText = `${displayPrice} SALE
Hot Wheels Virtual Garage
Seller: ${seller}
Buyer: ${buyer}
https://flowscan.io/transaction/${txId}`;
        await postTweet(fallbackText, null);
        postedTxIds.add(txId);
        return;
      }

      // example: "Series 10, Common, Modern Motors, Basic, 2018"
      const line = `${hwData.series}, ${hwData.rarity}, ${hwData.miniCollection}, ${hwData.typeField}, ${hwData.releaseYear}`;

      const tweetText = `${displayPrice} SALE
${line}
Seller: ${seller}
Buyer: ${buyer}
https://flowscan.io/transaction/${txId}`;

      await postTweet(tweetText, null);
      postedTxIds.add(txId);

      //
      // 5) Standard fallback
      //
    } else {
      try {
        const txResults = await getTransactionResults(txId);
        let seller = event.data?.seller || "UnknownSeller";
        let buyer = "UnknownBuyer";
        const nftId =
          event.data?.nftID ||
          event.data?.nftUUID ||
          event.data?.id ||
          "UnknownNFTID";

        if (txResults?.events) {
          for (const evt of txResults.events) {
            const decoded = evt.payload
              ? decodeEventPayloadBase64(evt.payload)
              : null;
            if (
              evt.type === "A.1d7e57aa55817448.NonFungibleToken.Withdrawn" &&
              decoded
            ) {
              const fields = decoded.value?.fields || [];
              let eventIdString = "";
              let eventFromString = "";
              for (const f of fields) {
                if (f.name === "id") eventIdString = f.value?.value || "";
                if (f.name === "from") eventFromString = f.value?.value || "";
              }
              if (eventIdString === String(nftId)) {
                seller = eventFromString;
              }
            }
            if (
              evt.type === "A.1d7e57aa55817448.NonFungibleToken.Deposited" &&
              decoded
            ) {
              const fields = decoded.value?.fields || [];
              let eventIdString = "";
              let eventToString = "";
              for (const f of fields) {
                if (f.name === "id") eventIdString = f.value?.value || "";
                if (f.name === "to") eventToString = f.value?.value || "";
              }
              if (eventIdString === String(nftId)) {
                buyer = eventToString;
              }
            }
          }
        }

        // fallback storeAddr
        const storeAddr = event.data?.storefrontAddress || "";
        if (seller === "UnknownSeller" && storeAddr) {
          seller = storeAddr;
        }

        // get basic metadata
        const txMetadata = await getTransactionMetadata(txId);
        let nftName =
          txMetadata.name || event.data?.metadata?.name || "Unknown NFT";

        const tweetText = `${rawPrice} SALE
${nftName}
Seller: ${seller}
Buyer: ${buyer}
https://flowscan.io/transaction/${txId}`;

        const imageUrl =
          txMetadata.imageUrl || event.data?.metadata?.imageUrl || null;

        await postTweet(tweetText, imageUrl);
        postedTxIds.add(txId);
      } catch (err) {
        console.error("Error processing standard NFT:", err);

        const fallback = `${rawPrice} SALE
Unknown NFT
Seller: UnknownSeller
https://flowscan.io/transaction/${txId}`;

        await postTweet(fallback, null);
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
