const fcl = require("@onflow/fcl");
const fetch = require("node-fetch"); // node-fetch@2 in CommonJS
const { FLOW_ACCESS_NODE } = require("./config");

// Configure FCL
fcl.config().put("accessNode.api", FLOW_ACCESS_NODE);

/**
 * Get transaction data directly from Flow API with enhanced logging
 * @param {string} txId - Transaction ID
 * @returns {Promise<Object|null>} Transaction data
 */
async function getTransactionData(txId) {
  try {
    console.log(`Getting transaction data from Flow API for ${txId}`);
    const response = await fetch(`${FLOW_ACCESS_NODE}/v1/transactions/${txId}`);

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const txData = await response.json();

    // You can keep or remove the enhanced logs as needed
    console.log("----- TRANSACTION DATA (Partial Logging) -----");
    console.log(`Transaction ID: ${txId}`);
    if (txData.script) {
      console.log(`Script length: ${txData.script.length} characters`);
    }
    console.log("----- END TRANSACTION DATA -----");

    return txData;
  } catch (err) {
    console.error("Error fetching transaction data:", err);
    return null;
  }
}

/**
 * Fetch transaction results (used if you need to read events, etc.)
 * @param {string} txId
 * @returns {Promise<Object|null>}
 */
async function getTransactionResults(txId) {
  try {
    const response = await fetch(
      `${FLOW_ACCESS_NODE}/v1/transaction_results/${txId}`
    );
    if (!response.ok) {
      throw new Error(
        `Tx results request failed: ${response.status} ${response.statusText}`
      );
    }
    return await response.json();
  } catch (err) {
    console.error("Error fetching transaction results:", err);
    return null;
  }
}

module.exports = {
  fcl,
  getTransactionData,
  getTransactionResults,
};
