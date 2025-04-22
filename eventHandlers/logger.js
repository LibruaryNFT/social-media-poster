// eventHandlers/logger.js - UPDATED (Minor robustness)

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
 * Now called conditionally only when a tweet is being sent.
 */
function logAllEvents(events) {
  // Add check for null/undefined events array
  if (!events || events.length === 0) {
    console.log("=== No events provided to logAllEvents ===");
    return;
  }
  console.log("=== ALL EVENTS in TX (Sale met tweet criteria) ==="); // Updated header
  for (const evt of events) {
    const decoded = evt.payload ? decodeEventPayloadBase64(evt.payload) : null;
    console.log(
      `Event type=${evt.type}, decoded=`,
      // Limit stringify depth slightly for very large payloads if needed (optional)
      JSON.stringify(decoded, null, 2 /*, optional depth limit e.g., 5 */)
    );
  }
  console.log("=== END ALL EVENTS ===");
}

module.exports = {
  decodeEventPayloadBase64,
  logAllEvents,
};
