const fcl = require("@onflow/fcl");
const fetch = require("node-fetch");
const { FLOW_ACCESS_NODE, FLOW_REST_ENDPOINT } = require("./config");

// 1) FCL uses the Web gRPC domain for event subscriptions & scripts
fcl.config().put("accessNode.api", FLOW_ACCESS_NODE);

/**
 * getTransactionData, getTransactionResults
 * - still call rest-mainnet.onflow.org
 */
async function getTransactionData(txId) {
  try {
    console.log(`Getting transaction data from Flow REST for ${txId}`);
    const resp = await fetch(`${FLOW_REST_ENDPOINT}/v1/transactions/${txId}`);
    if (!resp.ok) {
      throw new Error(`API request failed: ${resp.status} ${resp.statusText}`);
    }
    const txData = await resp.json();

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

async function getTransactionResults(txId) {
  try {
    const resp = await fetch(
      `${FLOW_REST_ENDPOINT}/v1/transaction_results/${txId}`
    );
    if (!resp.ok) {
      throw new Error(
        `Tx results request failed: ${resp.status} ${resp.statusText}`
      );
    }
    return await resp.json();
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
