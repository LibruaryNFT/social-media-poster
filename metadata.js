// metadata.js
// ────────────────────────────────────────────────────────────────────
//  •  Original helpers for Pack‑metadata & fallback metadata
//  •  NEW: getFlowPrice()  — returns live FLOW→USD and is exported
// ────────────────────────────────────────────────────────────────────

const fs = require("fs");
const { fcl } = require("./flow");
const { getTransactionData, getTransactionResults } = require("./flow");
const Buffer = require("buffer").Buffer;

/* ──────────────────────────────────────────────────────────── */
/* 0.  Cadence‑dictionary helper  (unchanged)                  */
/* ──────────────────────────────────────────────────────────── */
function parseCadenceDictionary(obj) {
  if (!obj || obj.type !== "Dictionary" || !Array.isArray(obj.value)) return {};
  const res = {};
  for (const { key, value } of obj.value) {
    if (typeof key?.value === "string" && typeof value?.value === "string") {
      res[key.value] = value.value;
    }
  }
  return res;
}

/* ──────────────────────────────────────────────────────────── */
/* 1.  getTransactionMetadata  (unchanged)                     */
/* ──────────────────────────────────────────────────────────── */
async function getTransactionMetadata(txId) {
  const tx = await fcl.send([fcl.getTransaction(txId)]).then(fcl.decode);
  if (!Array.isArray(tx.arguments)) return {};

  const finalData = {};
  for (const argB64 of tx.arguments) {
    try {
      const str = Buffer.from(argB64, "base64").toString("utf-8");
      const parsed = JSON.parse(str);

      if (parsed && typeof parsed === "object" && !parsed.type) {
        Object.assign(finalData, parsed); // plain JSON
      } else {
        Object.assign(finalData, parseCadenceDictionary(parsed)); // Cadence dict
      }
    } catch {
      /* skip */
    }
  }
  return finalData;
}

/* ──────────────────────────────────────────────────────────── */
/* 2.  extractPackNFTMetadata  (unchanged)                     */
/* ──────────────────────────────────────────────────────────── */
async function extractPackNFTMetadata(txId, nftId) {
  console.log(
    `\n=== Extracting PackNFT metadata for TX: ${txId}, NFT ID: ${nftId} ===`
  );

  const meta = {
    name: "Unknown NFT",
    imageUrl: null,
    found: false,
    source: null,
  };

  /* 1️⃣  transaction arguments */
  const txData = await getTransactionData(txId);
  if (Array.isArray(txData?.arguments)) {
    for (let i = 0; i < txData.arguments.length; i++) {
      try {
        const decoded = Buffer.from(txData.arguments[i], "base64").toString(
          "utf-8"
        );
        const parsed = JSON.parse(decoded);

        if (parsed?.name || parsed?.imageUrl || parsed?.imageURL) {
          meta.name = parsed.name ?? meta.name;
          meta.imageUrl = parsed.imageUrl ?? parsed.imageURL ?? meta.imageUrl;
          meta.found = true;
          meta.source = `tx.arguments[${i}]`;
        }

        const dict = parseCadenceDictionary(parsed);
        if (dict.name || dict.imageUrl || dict.imageURL) {
          meta.name = dict.name ?? meta.name;
          meta.imageUrl = dict.imageUrl ?? dict.imageURL ?? meta.imageUrl;
          meta.found = true;
          meta.source = `tx.arguments[${i}] CadenceDictionary`;
        }

        if (parsed?.metadata) {
          meta.name = parsed.metadata.name ?? meta.name;
          meta.imageUrl =
            parsed.metadata.imageUrl ??
            parsed.metadata.imageURL ??
            meta.imageUrl;
          meta.found = true;
          meta.source = `tx.arguments[${i}].metadata`;
        }
      } catch {
        /* ignore */
      }
    }
  }

  /* 2️⃣  events payloads */
  if (!meta.found || !meta.imageUrl) {
    const res = await getTransactionResults(txId);
    for (const ev of res?.events || []) {
      try {
        const parsed = JSON.parse(
          Buffer.from(ev.payload, "base64").toString("utf-8")
        );
        if (parsed?.metadata) {
          meta.name = parsed.metadata.name ?? meta.name;
          meta.imageUrl =
            parsed.metadata.imageUrl ??
            parsed.metadata.imageURL ??
            meta.imageUrl;
          meta.found = true;
          meta.source = "events.payload.metadata";
        } else if (parsed?.name || parsed?.imageUrl || parsed?.imageURL) {
          meta.name = parsed.name ?? meta.name;
          meta.imageUrl = parsed.imageUrl ?? parsed.imageURL ?? meta.imageUrl;
          meta.found = true;
          meta.source = "events.payload";
        }
      } catch {
        /* ignore */
      }
    }
  }

  console.log("=== PackNFT Metadata Extraction Result ===");
  console.log("Name      :", meta.name);
  console.log("Image URL :", meta.imageUrl ?? "N/A");
  console.log("Source    :", meta.source ?? "N/A");
  console.log("Found?    :", meta.found ? "YES" : "NO");
  console.log("==========================================\n");
  return meta;
}

/* ──────────────────────────────────────────────────────────── */
/* 3.  NEW — getFlowPrice()  (USD per FLOW)                    */
/* ──────────────────────────────────────────────────────────── */
const ORACLE_ADDR = "0xe385412159992e11";
const flowPriceCadence = fs.readFileSync("./flow/flowprice.cdc", "utf-8");

let cachedPrice = null;
let cachedAtMs = 0;
const TTL_MS = 60_000;

/**
 * Returns Number | null   (USD per 1 FLOW)
 */
async function getFlowPrice() {
  const now = Date.now();
  if (cachedPrice !== null && now - cachedAtMs < TTL_MS) return cachedPrice;

  try {
    const [ufix] = await fcl.query({
      cadence: flowPriceCadence,
      args: (arg, t) => [arg(ORACLE_ADDR, t.Address)],
    });
    const price = parseFloat(ufix);
    if (!isNaN(price) && price > 0) {
      cachedPrice = price;
      cachedAtMs = now;
      return price;
    }
  } catch (err) {
    console.error("getFlowPrice() oracle query failed:", err);
  }
  return null;
}

/* ──────────────────────────────────────────────────────────── */
/* 4.  exports                                                 */
/* ──────────────────────────────────────────────────────────── */
module.exports = {
  parseCadenceDictionary,
  getTransactionMetadata,
  extractPackNFTMetadata,
  getFlowPrice, // ← new export
};
