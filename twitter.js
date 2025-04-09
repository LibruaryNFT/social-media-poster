const { TwitterApi } = require("twitter-api-v2");
const fetch = require("node-fetch");
const {
  TWITTER_API_KEY,
  TWITTER_API_SECRET,
  TWITTER_ACCESS_TOKEN,
  TWITTER_ACCESS_SECRET,
} = require("./config");

// Initialize the Twitter client
const twitterClient = new TwitterApi({
  appKey: TWITTER_API_KEY,
  appSecret: TWITTER_API_SECRET,
  accessToken: TWITTER_ACCESS_TOKEN,
  accessSecret: TWITTER_ACCESS_SECRET,
});

/**
 * Fetch an image URL, then upload to Twitter, returning the media ID
 * @param {string} url
 * @returns {Promise<string|null>} mediaId or null
 */
async function fetchAndUploadImage(url) {
  try {
    console.log("Fetching image:", url);
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error("Image fetch failed:", resp.status, resp.statusText);
      return null;
    }
    const buffer = await resp.buffer();

    const contentType = resp.headers.get("content-type") || "";
    let mediaType = "png";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) {
      mediaType = "jpg";
    } else if (contentType.includes("gif")) {
      mediaType = "gif";
    }

    console.log("Uploading image to Twitter...");
    const mediaId = await twitterClient.v1.uploadMedia(buffer, {
      type: mediaType,
    });
    console.log("Posted media ID:", mediaId);
    return mediaId;
  } catch (err) {
    console.error("Error uploading image:", err);
    return null;
  }
}

/**
 * Post a tweet with optional image
 * @param {string} tweetText
 * @param {string|null} imageUrl
 * @returns {Promise<void>}
 */
async function postTweet(tweetText, imageUrl = null) {
  try {
    console.log("Tweeting:\n", tweetText);

    // Upload image if available
    let mediaId = null;
    if (imageUrl) {
      mediaId = await fetchAndUploadImage(imageUrl);
    }

    // Post to Twitter
    if (mediaId) {
      const response = await twitterClient.v2.tweet(tweetText, {
        media: { media_ids: [mediaId] },
      });
      console.log(`Tweet posted with image. ID: ${response.data.id}`);
    } else {
      const response = await twitterClient.v2.tweet(tweetText);
      console.log(`Tweet posted (text-only). ID: ${response.data.id}`);
    }
  } catch (err) {
    console.error("Error posting tweet:", err);
  }
}

module.exports = {
  postTweet,
};
