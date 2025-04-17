// eventHandlers/logger.js

const Buffer = require("buffer").Buffer;

/**
 * Attempt to decode a base64-encoded event payload into JSON.
 * Returns null if decoding or JSON.parse fails.
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
 * logAllEvents: for debugging, print out each event's type + fully decoded fields if possible.
 * Example usage in your main event handler:
 *   const txResults = await getTransactionResults(txId);
 *   logAllEvents(txResults.events);
 */
function logAllEvents(events) {
  console.log("=== ALL EVENTS in TX ===");
  for (const evt of events) {
    const decoded = evt.payload ? decodeEventPayloadBase64(evt.payload) : null;
    console.log(
      `Event type=${evt.type}, decoded=`,
      JSON.stringify(decoded, null, 2)
    );
  }
  console.log("=== END ALL EVENTS ===");
}

module.exports = {
  decodeEventPayloadBase64,
  logAllEvents,
};
