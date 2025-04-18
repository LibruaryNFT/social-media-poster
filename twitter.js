// twitter.js
const fetch = require("node-fetch");

/**
 * Fetch an image URL, then upload to Twitter using the provided client instance, returning the media ID
 * @param {object} client - The specific TwitterApi client instance (readWrite)
 * @param {string} url
 * @returns {Promise<string|null>} mediaId or null
 */
async function fetchAndUploadImage(client, url) {
  try {
    console.log("Fetching image:", url);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(
        `Image fetch failed: ${resp.status} ${resp.statusText} for ${url}`
      );
      return null;
    }
    const buffer = await resp.buffer();

    const contentType = resp.headers.get("content-type") || "";
    let mediaType = "png"; // Default assumption
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      mediaType = "jpg";
    } else if (contentType.includes("gif")) {
      mediaType = "gif";
    } else if (!contentType.includes("png")) {
      console.warn(
        `Unknown content type '${contentType}' for image, attempting upload as png.`
      );
    }

    console.log(`Uploading image to Twitter as type ${mediaType}...`);
    // Use the passed-in 'client' instance
    const mediaId = await client.v1.uploadMedia(buffer, {
      type: mediaType,
    });
    console.log("Posted media ID:", mediaId);
    return mediaId;
  } catch (err) {
    console.error(`Error uploading image from ${url}:`, err);
    if (err.data) {
      console.error("Twitter API Error Details during upload:", err.data);
    }
    return null;
  }
}

/**
 * Post a tweet with optional image using the provided client instance
 * @param {object} client - The specific TwitterApi client instance (readWrite)
 * @param {string} tweetText
 * @param {string|null} imageUrl
 * @returns {Promise<string|null>} The ID of the created tweet, or null if failed.
 */
async function postTweet(client, tweetText, imageUrl = null) {
  try {
    // Identify which client is being used for logging purposes (optional)
    // This requires pinnacleBot and flowSalesBot to be accessible here,
    // which might mean importing them directly or finding another way to identify.
    // For simplicity, let's just log that we're posting.
    // const clientIdentifier = client === require('../index').pinnacleBot ? 'PinnacleBot' : 'FlowSalesBot'; // This might be fragile
    // console.log(`Attempting to tweet via ${clientIdentifier}:\n`, tweetText);
    console.log(`Attempting to tweet:\n`, tweetText);

    // Upload image if available
    let mediaId = null;
    if (imageUrl) {
      // Pass the 'client' instance to fetchAndUploadImage
      mediaId = await fetchAndUploadImage(client, imageUrl);
    }

    // Post to Twitter
    let response;
    if (mediaId) {
      // Use the passed-in 'client' instance
      response = await client.v2.tweet({
        text: tweetText,
        media: { media_ids: [mediaId] },
      });
      console.log(`Tweet posted with image. ID: ${response.data.id}`);
    } else {
      // Use the passed-in 'client' instance
      response = await client.v2.tweet({ text: tweetText });
      console.log(`Tweet posted (text-only). ID: ${response.data.id}`);
    }
    return response.data.id; // Return the tweet ID on success
  } catch (err) {
    console.error(`Error posting tweet:`, err);
    if (err.data) {
      console.error("Twitter API Error Details during tweet:", err.data);
    }
    throw err; // Re-throwing allows the caller (handleEvent) to know it failed
  }
}

module.exports = {
  postTweet,
};
