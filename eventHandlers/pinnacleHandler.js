// eventHandlers/pinnacleHandler.js
const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller");
const fs = require("fs");
const { fcl } = require("../flow");

const pinnacleCadence = fs.readFileSync("./flow/pinnacle.cdc", "utf-8");

async function handlePinnacle({ event, txResults, displayPrice }) {
  const nftId =
    event.data?.nftID ||
    event.data?.nftUUID ||
    event.data?.id ||
    "UnknownNFTID";

  // parse buyer/seller from standard NonFungibleToken events
  const { seller: rawSeller, buyer } = parseBuyerSellerFromNonFungibleToken(
    txResults.events,
    "A.edf9df96c92f4595.Pinnacle.NFT",
    nftId
  );

  let seller = rawSeller;
  // fallback to storefront
  const storeAddr = event.data?.storefrontAddress || "";
  if (seller === "UnknownSeller" && storeAddr) {
    seller = storeAddr;
  } else if (seller === "UnknownSeller" && event.data?.seller) {
    seller = event.data.seller;
  }

  // call pinnacle script
  let pinData = null;
  try {
    pinData = await fcl.query({
      cadence: pinnacleCadence,
      args: (arg, t) => [arg(seller, t.Address), arg(String(nftId), t.UInt64)],
    });
  } catch (err) {
    console.error("Error querying pinnacle script:", err);
  }

  if (!pinData) {
    const fallbackText = `${displayPrice} SALE on @DisneyPinnacle
Unknown NFT
Seller: ${seller}
https://flowscan.io/transaction/${event.transactionId}`;
    return { tweetText: fallbackText, imageUrl: null };
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
https://flowscan.io/transaction/${event.transactionId}`;

  return { tweetText, imageUrl: null };
}

module.exports = { handlePinnacle };
