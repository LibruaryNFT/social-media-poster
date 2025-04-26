// tweetCounter_history.js
require("dotenv").config();
const { TwitterApi } = require("twitter-api-v2");

// --- Configuration ---
const TARGET_USERNAME = "flowSalesBot"; // The username of the bot to monitor
const MAX_PAGES_TO_FETCH = 35; // Limit requests to avoid hitting rate limits excessively (approx 35 * 100 = 3500 tweets)

// --- Twitter Client Initialization ---
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.FLOWSALESBOT_ACCESS_TOKEN,
  accessSecret: process.env.FLOWSALESBOT_ACCESS_SECRET,
});
const readOnlyClient = twitterClient.readOnly;

/**
 * Fetches the user ID for a given username.
 * @param {string} username
 * @returns {Promise<string|null>} User ID or null if not found/error.
 */
async function getUserIdByUsername(username) {
  try {
    console.log(`Workspaceing user ID for @${username}...`);
    const user = await readOnlyClient.v2.userByUsername(username);
    if (user?.data?.id) {
      console.log(`User ID for @${username} is ${user.data.id}`);
      return user.data.id;
    } else {
      console.error(`Could not find user ID for @${username}. Response:`, user);
      return null;
    }
  } catch (error) {
    console.error(`Error fetching user ID for @${username}:`, error);
    return null;
  }
}

/**
 * Fetches recent tweets for a user, up to API/script limits.
 * @param {string} userId
 * @returns {Promise<Array<{id: string, text: string, created_at: string}>>} Array of tweet objects.
 */
async function fetchUserTweetHistory(userId) {
  let allTweets = [];
  let paginationToken = undefined;
  let page = 1;
  const maxResultsPerPage = 100;

  console.log(
    `Workspaceing tweet history for user ${userId} (up to ~${
      MAX_PAGES_TO_FETCH * maxResultsPerPage
    } tweets)...`
  );

  try {
    do {
      console.log(`Workspaceing page ${page} (Max ${MAX_PAGES_TO_FETCH})...`);
      const params = {
        max_results: maxResultsPerPage,
        "tweet.fields": "created_at", // Crucial: Request the creation date!
        // 'exclude': 'replies,retweets', // Optional: Uncomment to exclude
      };
      if (paginationToken) {
        params.pagination_token = paginationToken;
      }

      const timeline = await readOnlyClient.v2.userTimeline(userId, params);

      const tweetsInData = timeline.data?.data || [];
      const resultCount = timeline.meta?.result_count || 0;

      if (resultCount > 0) {
        console.log(`Page ${page} returned ${resultCount} tweets.`);
        allTweets = allTweets.concat(tweetsInData); // Add fetched tweets to our list
      } else {
        console.log(`Page ${page} returned 0 tweets.`);
      }

      paginationToken = timeline.meta?.next_token;
      page++;

      // Stop if no more pages OR if we hit our page limit
      if (!paginationToken) {
        console.log("No more pages found.");
      }
      if (page > MAX_PAGES_TO_FETCH) {
        console.log(`Reached maximum page limit (${MAX_PAGES_TO_FETCH}).`);
        paginationToken = undefined; // Force loop to stop
      }

      // Polite delay
      if (paginationToken) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } while (paginationToken);

    console.log(
      `Finished fetching. Total tweets collected: ${allTweets.length}`
    );
    return allTweets;
  } catch (error) {
    console.error(
      `Error fetching timeline history for user ${userId} (page ${page}):`,
      error
    );
    if (error.rateLimit) {
      console.error(
        `Rate limit hit: ${
          error.rateLimit.remaining
        } requests left. Resets at ${new Date(error.rateLimit.reset * 1000)}`
      );
    }
    console.warn("Returning potentially incomplete history due to error.");
    return allTweets; // Return whatever was collected before the error
  }
}

/**
 * Groups tweets by day (UTC) and counts them.
 * @param {Array<{created_at: string}>} tweets Array of tweet objects with created_at field.
 * @returns {Map<string, number>} Map where key is YYYY-MM-DD (UTC) and value is count.
 */
function groupTweetsByDayUTC(tweets) {
  const dailyCounts = new Map();
  for (const tweet of tweets) {
    if (!tweet.created_at) {
      console.warn(
        `Tweet missing created_at: ${tweet.id || JSON.stringify(tweet)}`
      );
      continue;
    }
    try {
      // created_at is already UTC ISO string (e.g., "2025-04-25T18:30:00.000Z")
      const dateString = tweet.created_at.substring(0, 10); // Extract "YYYY-MM-DD"
      dailyCounts.set(dateString, (dailyCounts.get(dateString) || 0) + 1);
    } catch (e) {
      console.error(
        `Error processing date for tweet: ${tweet.id || JSON.stringify(tweet)}`,
        e
      );
    }
  }
  return dailyCounts;
}

/**
 * Main function to perform the history fetch, count, and log results.
 */
async function performHistoryCount() {
  console.log(
    `\n--- Running Tweet History Count (One-Time) --- [${new Date().toString()}] ---`
  );

  const userId = await getUserIdByUsername(TARGET_USERNAME);
  if (!userId) {
    throw new Error(`Failed to get User ID for ${TARGET_USERNAME}. Aborting.`);
  }

  const tweetHistory = await fetchUserTweetHistory(userId);
  if (tweetHistory.length === 0) {
    console.log("No tweets found in the fetched history.");
    return;
  }

  const dailyCounts = groupTweetsByDayUTC(tweetHistory);

  // Sort dates for chronological output
  const sortedDates = Array.from(dailyCounts.keys()).sort();

  console.log(
    `\n===============================================================`
  );
  console.log(`📊 Tweet Counts Per Day (UTC) for @${TARGET_USERNAME}`);
  console.log(
    `   (Based on the ${tweetHistory.length} most recent tweets found)`
  );
  console.log(
    `---------------------------------------------------------------`
  );
  for (const date of sortedDates) {
    console.log(`   ${date}: ${dailyCounts.get(date)} tweets`);
  }
  console.log(
    `===============================================================`
  );
}

// --- Script Execution ---

(async () => {
  console.log("Tweet History Counter Script Initialized (One-Time Run).");
  console.log(`Workspaceing history for @${TARGET_USERNAME}`);
  try {
    await performHistoryCount();
    console.log("Script finished successfully.");
    process.exit(0); // Exit with success code
  } catch (err) {
    console.error("\n--- Script failed during execution ---");
    console.error(err.message || err); // Log the specific error message
    process.exit(1); // Exit with error code
  }
})();
