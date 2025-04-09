const { fcl } = require("./flow");
const { getTransactionData, getTransactionResults } = require("./flow");

/**
 * Utility: parse Cadence Dictionary objects into key/value pairs
 */
function parseCadenceDictionary(obj) {
  if (!obj || obj.type !== "Dictionary" || !Array.isArray(obj.value)) {
    return {};
  }
  const result = {};
  for (const entry of obj.value) {
    const k = entry.key?.value;
    const v = entry.value?.value;
    if (typeof k === "string" && typeof v === "string") {
      result[k] = v;
    }
  }
  return result;
}

/**
 * (Legacy) Parse transaction arguments to find metadata
 */
async function getTransactionMetadata(txId) {
  const txResult = await fcl.send([fcl.getTransaction(txId)]).then(fcl.decode);
  if (!Array.isArray(txResult.arguments)) return {};

  const finalData = {};

  for (const argBase64 of txResult.arguments) {
    const buf = Buffer.from(argBase64, "base64");
    const str = buf.toString("utf-8");
    try {
      const parsed = JSON.parse(str);
      // If it's plain JSON, merge
      if (parsed && typeof parsed === "object" && !parsed.type) {
        Object.assign(finalData, parsed);
      } else {
        // Possibly a Cadence dictionary
        const possibleDict = parseCadenceDictionary(parsed);
        if (Object.keys(possibleDict).length > 0) {
          Object.assign(finalData, possibleDict);
        }
      }
    } catch {
      // skip
    }
  }
  return finalData;
}

/**
 * Extract metadata from a "PackNFT" style transaction
 */
async function extractPackNFTMetadata(txId, nftId) {
  console.log(`Extracting PackNFT metadata for TX: ${txId}, NFT ID: ${nftId}`);

  // Default metadata
  const metadata = {
    name: "Unknown NFT",
    imageUrl: null,
    found: false,
    source: null,
  };

  // 1. Retrieve transaction data from Flow
  const txData = await getTransactionData(txId);
  if (!txData) return metadata;

  // (Add your advanced parsing logic here)
  // For brevity, we won't copy the entire advanced steps again,
  // but you can keep your approach of scanning arguments, script, events, etc.

  // 2. Check transaction results for events, etc.
  const resultsData = await getTransactionResults(txId);
  if (resultsData && resultsData.events && Array.isArray(resultsData.events)) {
    // parse events to find name/image
  }

  // Return final
  return metadata;
}

module.exports = {
  parseCadenceDictionary,
  getTransactionMetadata,
  extractPackNFTMetadata,
};
