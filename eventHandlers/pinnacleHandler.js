// eventHandlers/pinnacleHandler.js - UPDATED
const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller");
const fs = require("fs");
const { fcl } = require("../flow");

// Assuming pinnacle.cdc is in the flow directory relative to the project root
const pinnacleCadence = fs.readFileSync("./flow/pinnacle.cdc", "utf-8");
const PINNACLE_NFT_TYPE = "A.edf9df96c92f4595.Pinnacle.NFT"; // Define the constant

// UPDATED Signature: Accept new arguments
async function handlePinnacle({
  event,
  txResults,
  displayPrice,
  marketplaceSource,
  nftType,
  nftId,
}) {
  // Use passed nftId and nftType directly
  const id = nftId;
  const type = nftType; // Should always be PINNACLE_NFT_TYPE if this handler is called correctly

  if (!id || id === "UnknownNFTID" || type !== PINNACLE_NFT_TYPE) {
    console.warn(
      `Pinnacle handler: Skipping tweet for tx ${event.transactionId}. Incorrect type or missing ID. Type: ${type}, ID: ${id}`
    );
    return null;
  }

  // Parse buyer/seller from standard NonFungibleToken events using refined type/id
  const { seller: rawSeller, buyer } = parseBuyerSellerFromNonFungibleToken(
    txResults.events,
    type, // Use PINNACLE_NFT_TYPE
    id // Use refined ID
  );

  let seller = rawSeller;
  // Fallback to storefront or event data seller if NonFungibleToken parsing fails
  const storeAddr = event.data?.storefrontAddress || "";
  if (seller === "UnknownSeller" && storeAddr) {
    seller = storeAddr;
  } else if (seller === "UnknownSeller" && event.data?.seller) {
    seller = event.data.seller;
  }

  // --- Determine address to query the script with ---
  const queryAddress =
    buyer !== "UnknownBuyer"
      ? buyer
      : seller !== "UnknownSeller"
      ? seller
      : null;
  if (!queryAddress) {
    console.error(
      `Cannot query Pinnacle script for NFT ID ${id}: No valid buyer or seller address found.`
    );
    const fallbackText = `${displayPrice} SALE on @DisneyPinnacle
Unknown Pin (ID: ${id})
Seller: ${seller}
Buyer: ${buyer}
(Could not fetch metadata - address unknown)`;
    return { tweetText: fallbackText, imageUrl: null };
  }
  // ----------------------------------------------------

  // Call pinnacle script using the determined query address
  let pinData = null;
  try {
    console.log(
      `Querying Pinnacle script for NFT ID ${id} in collection of ${queryAddress}`
    );
    pinData = await fcl.query({
      cadence: pinnacleCadence,
      args: (arg, t) => [
        arg(queryAddress, t.Address),
        arg(String(id), t.UInt64), // Use refined ID
      ],
    });
  } catch (err) {
    console.error(
      `Error querying pinnacle script for NFT ${id} with address ${queryAddress} (Tx: ${event.transactionId}):`,
      err
    );
    const fallbackText = `${displayPrice} SALE on @DisneyPinnacle
Unknown Pin (ID: ${id})
Seller: ${seller}
Buyer: ${buyer}
(Error fetching metadata)`;
    return { tweetText: fallbackText, imageUrl: null };
  }

  if (!pinData) {
    console.error(
      `Pinnacle script returned null for NFT ID ${id} in collection of ${queryAddress} (Tx: ${event.transactionId})`
    );
    const fallbackText = `${displayPrice} SALE on @DisneyPinnacle
Unknown Pin (ID: ${id})
Seller: ${seller}
Buyer: ${buyer}
(Could not fetch metadata - script returned null)`;
    return { tweetText: fallbackText, imageUrl: null };
  }

  // --- Parse fields from script output ---
  const editionID = pinData.editionID ?? "N/A";
  const serialNumber = pinData.serialNumber; // Can be null

  let characters = "N/A";
  if (pinData.traits) {
    const charactersTrait = pinData.traits.find(
      (trait) => trait.name === "Characters"
    );
    if (
      charactersTrait &&
      Array.isArray(charactersTrait.value) &&
      charactersTrait.value.length > 0
    ) {
      characters = charactersTrait.value.join(", ");
    } else if (charactersTrait && charactersTrait.value) {
      characters = String(charactersTrait.value);
    }
  }

  let editionName = "Unknown Edition";
  let maxSupply = "N/A";
  if (pinData.editions && pinData.editions.length > 0) {
    editionName = pinData.editions[0].name ?? editionName;
    if (pinData.editions[0].max != null) {
      maxSupply = pinData.editions[0].max.toString();
    }
  }
  // -----------------------------------------

  // --- Construct Tweet ---
  const pinUrl = `https://disneypinnacle.com/pin/${editionID}`;

  let tweetLines = [
    `${displayPrice} SALE on @DisneyPinnacle`, // Keeps specific tag, ignores marketplaceSource
    `${editionName}`,
  ];

  if (serialNumber != null) {
    tweetLines.push(`Serial #: ${serialNumber}`);
  }

  tweetLines.push(`Max Mint: ${maxSupply}`);
  tweetLines.push(`Character(s): ${characters}`);
  tweetLines.push(`Edition ID: ${editionID}`);
  tweetLines.push(`Seller: ${seller}`);
  tweetLines.push(`Buyer: ${buyer}`);
  tweetLines.push(pinUrl);

  const tweetText = tweetLines.join("\n");
  // ----------------------

  return { tweetText, imageUrl: null }; // No image from script currently
}

module.exports = { handlePinnacle };
