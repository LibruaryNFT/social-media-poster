// eventHandlers/pinnacleHandler.js
const { parseBuyerSellerFromNonFungibleToken } = require("./parseBuyerSeller");
const fs = require("fs");
const { fcl } = require("../flow");

// Assuming pinnacle.cdc is in the flow directory relative to the project root
const pinnacleCadence = fs.readFileSync("./flow/pinnacle.cdc", "utf-8");
const PINNACLE_NFT_TYPE = "A.edf9df96c92f4595.Pinnacle.NFT"; // Define the constant

async function handlePinnacle({ event, txResults, displayPrice }) {
  const nftId =
    event.data?.nftID ||
    event.data?.nftUUID ||
    event.data?.id ||
    "UnknownNFTID";

  // Parse buyer/seller from standard NonFungibleToken events
  const { seller: rawSeller, buyer } = parseBuyerSellerFromNonFungibleToken(
    txResults.events,
    PINNACLE_NFT_TYPE, // Use the constant here
    nftId
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
  // Prefer buyer's address if available, otherwise use seller's
  // This assumes the NFT exists in one of their collections to successfully query metadata
  const queryAddress = buyer !== "UnknownBuyer" ? buyer : seller;
  if (queryAddress === "UnknownBuyer" || queryAddress === "UnknownSeller") {
    console.error(
      `Cannot query Pinnacle script: No valid buyer or seller address found for NFT ID ${nftId}`
    );
    const fallbackText = `${displayPrice} SALE on @DisneyPinnacle
Unknown NFT (ID: ${nftId})
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
      `Querying Pinnacle script for NFT ID ${nftId} in collection of ${queryAddress}`
    );
    pinData = await fcl.query({
      cadence: pinnacleCadence,
      // Pass the address that likely holds the NFT and the NFT ID
      args: (arg, t) => [
        arg(queryAddress, t.Address),
        arg(String(nftId), t.UInt64),
      ],
    });
    // console.log("Pinnacle Script Result:", JSON.stringify(pinData, null, 2)); // Optional: Log raw script output for debugging
  } catch (err) {
    console.error(
      `Error querying pinnacle script for NFT ${nftId} with address ${queryAddress}:`,
      err
    );
    // Fallback tweet if script query fails
    const fallbackText = `${displayPrice} SALE on @DisneyPinnacle
Unknown NFT (ID: ${nftId})
Seller: ${seller}
Buyer: ${buyer}
(Error fetching metadata)`;
    return { tweetText: fallbackText, imageUrl: null };
  }

  if (!pinData) {
    console.error(
      `Pinnacle script returned null for NFT ID ${nftId} in collection of ${queryAddress}`
    );
    const fallbackText = `${displayPrice} SALE on @DisneyPinnacle
Unknown NFT (ID: ${nftId})
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
    // Ensure value is an array and join, handle cases where it might not be or is empty
    if (
      charactersTrait &&
      Array.isArray(charactersTrait.value) &&
      charactersTrait.value.length > 0
    ) {
      characters = charactersTrait.value.join(", ");
    } else if (charactersTrait && charactersTrait.value) {
      // Handle if value is not an array but exists (fallback)
      characters = String(charactersTrait.value);
    }
  }

  let editionName = "Unknown Edition";
  let maxSupply = "N/A";
  if (pinData.editions && pinData.editions.length > 0) {
    editionName = pinData.editions[0].name ?? editionName; // Use nullish coalescing
    // Check if max is not null before converting to string
    if (pinData.editions[0].max != null) {
      maxSupply = pinData.editions[0].max.toString();
    }
  }
  // -----------------------------------------

  // --- Construct Tweet ---
  const pinUrl = `https://disneypinnacle.com/pin/${editionID}`;

  // Start building the tweet text
  let tweetLines = [
    `${displayPrice} SALE on @DisneyPinnacle`,
    `${editionName}`, // e.g., "Tin Toy [Pixar Animation Studios • Pixar Alien Remix Vol.1, Standard]"
  ];

  // Add Serial Number line only if it's not null
  if (serialNumber != null) {
    tweetLines.push(`Serial #: ${serialNumber}`);
  }

  // Add other details
  tweetLines.push(`Max Mint: ${maxSupply}`);
  tweetLines.push(`Character(s): ${characters}`); // e.g., "Alien"
  tweetLines.push(`Edition ID: ${editionID}`); // e.g., 550
  tweetLines.push(`Seller: ${seller}`);
  tweetLines.push(`Buyer: ${buyer}`);
  tweetLines.push(pinUrl); // Add the pinnacle URL

  const tweetText = tweetLines.join("\n");
  // ----------------------

  // Currently, pinnacle script doesn't easily provide a direct image URL. Set to null.
  return { tweetText, imageUrl: null };
}

module.exports = { handlePinnacle };
