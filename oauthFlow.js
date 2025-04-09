require("dotenv").config();
const express = require("express");
const { TwitterApi } = require("twitter-api-v2");
const crypto = require("crypto");

const app = express();
const port = 3000;
const CALLBACK_URL = "http://localhost:3000/callback";

// Generate a unique state parameter to prevent CSRF
const generateState = () => crypto.randomBytes(16).toString("hex");

// Custom client settings forcing Twitter's original domain
const customClientSettings = {
  endpoints: {
    requestToken: "https://api.twitter.com/oauth/request_token",
    authorize: "https://api.twitter.com/oauth/authorize",
    authenticate: "https://api.twitter.com/oauth/authenticate",
    accessToken: "https://api.twitter.com/oauth/access_token",
  },
};

// Initialize TwitterApi with custom endpoints
const client = new TwitterApi(
  {
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
  },
  customClientSettings
);

// More robust storage with timestamp for cleanup
const tokenSecretStore = {};

// Cleanup old tokens (optional but good practice)
setInterval(() => {
  const now = Date.now();
  Object.keys(tokenSecretStore).forEach((key) => {
    if (now - tokenSecretStore[key].timestamp > 3600000) {
      // 1 hour
      delete tokenSecretStore[key];
    }
  });
}, 3600000); // Check every hour

app.get("/auth", async (req, res) => {
  try {
    const state = generateState();

    // Use authToken explicitly to ensure we're using oauth/request_token endpoint
    const authClient = client.readWrite;
    const { url, oauth_token, oauth_token_secret } =
      await authClient.generateAuthLink(CALLBACK_URL, { state });

    // Store both secret and timestamp
    tokenSecretStore[oauth_token] = {
      secret: oauth_token_secret,
      timestamp: Date.now(),
      state,
    };

    console.log("Generated auth link:", url);
    console.log("Stored token data for oauth_token:", oauth_token);

    return res.redirect(url);
  } catch (error) {
    console.error("Error generating auth link:", error);
    console.error("Full error details:", JSON.stringify(error, null, 2));
    return res.status(500).send("Error generating auth link: " + error.message);
  }
});

app.get("/callback", async (req, res) => {
  try {
    const { oauth_token, oauth_verifier, state } = req.query;
    console.log("Callback received with parameters:", req.query);

    if (!oauth_token || !oauth_verifier) {
      return res.status(400).send("Missing required OAuth parameters");
    }

    const tokenData = tokenSecretStore[oauth_token];
    if (!tokenData) {
      return res.status(400).send("No matching OAuth token found");
    }

    // Optional state verification
    if (state && tokenData.state !== state) {
      return res.status(400).send("State parameter mismatch");
    }

    console.log("Retrieved token data:", tokenData);

    // Create a new instance for the token exchange
    const authClient = new TwitterApi(
      {
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: oauth_token,
        accessSecret: tokenData.secret,
      },
      customClientSettings
    );

    // Method 1: Use login with all parameters
    try {
      const {
        client: userClient,
        accessToken,
        accessSecret,
        screenName,
      } = await authClient.login(oauth_verifier);

      console.log("Authentication successful!");
      console.log("Access Token:", accessToken);
      console.log("Access Secret:", accessSecret);
      console.log("Screen Name:", screenName);

      // Clean up the temporary token
      delete tokenSecretStore[oauth_token];

      return res.send(`
        <h2>Authentication Successful!</h2>
        <p>Authenticated as: <strong>${screenName}</strong></p>
        <p>Save these credentials in your .env file:</p>
        <pre>
TWITTER_ACCESS_TOKEN=${accessToken}
TWITTER_ACCESS_SECRET=${accessSecret}
        </pre>
        <p>Add these to your bot code to tweet as @${screenName}</p>
      `);
    } catch (loginError) {
      console.error("Login method failed:", loginError);

      // Method 2: Try manual token exchange as fallback
      try {
        console.log("Attempting manual token exchange as fallback...");

        // Manually construct the token exchange request
        const response = await fetch(
          "https://api.twitter.com/oauth/access_token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: authClient.generateAuthHeader(
                "POST",
                "https://api.twitter.com/oauth/access_token",
                {
                  oauth_verifier: oauth_verifier,
                }
              ),
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.text();
        const params = new URLSearchParams(data);

        const accessToken = params.get("oauth_token");
        const accessSecret = params.get("oauth_token_secret");
        const screenName = params.get("screen_name");

        console.log("Manual token exchange successful!");
        console.log("Access Token:", accessToken);
        console.log("Access Secret:", accessSecret);
        console.log("Screen Name:", screenName);

        delete tokenSecretStore[oauth_token];

        return res.send(`
          <h2>Authentication Successful! (Fallback Method)</h2>
          <p>Authenticated as: <strong>${screenName}</strong></p>
          <p>Save these credentials in your .env file:</p>
          <pre>
TWITTER_ACCESS_TOKEN=${accessToken}
TWITTER_ACCESS_SECRET=${accessSecret}
          </pre>
          <p>Add these to your bot code to tweet as @${screenName}</p>
        `);
      } catch (fallbackError) {
        console.error("Fallback method also failed:", fallbackError);
        throw new Error("Both authentication methods failed");
      }
    }
  } catch (error) {
    console.error("Error during OAuth callback:", error);
    console.error("Full error object:", JSON.stringify(error, null, 2));

    // More detailed error response
    return res.status(500).send(`
      <h2>Authentication Error</h2>
      <p>Error message: ${error.message}</p>
      <p>If you're seeing "Request token missing", please try these troubleshooting steps:</p>
      <ol>
        <li>Check that your app has "Read and write" permissions in the Twitter Developer Portal</li>
        <li>Verify that the callback URL in your Developer Portal exactly matches "${CALLBACK_URL}"</li>
        <li>Try clearing your browser cookies for twitter.com</li>
        <li>Make sure you're logged in as @PinnaclePinBot when authorizing</li>
      </ol>
      <p><a href="/auth">Try Again</a></p>
    `);
  }
});

// Add a simple home page
app.get("/", (req, res) => {
  res.send(`
    <h1>Twitter Bot OAuth Setup</h1>
    <p>This tool helps you get OAuth 1.0a tokens for your Twitter bot.</p>
    <p><a href="/auth">Start the Authentication Process</a></p>
    <p>Make sure you're signed in as @PinnaclePinBot before clicking.</p>
  `);
});

app.listen(port, () => {
  console.log(`OAuth server running at http://localhost:${port}`);
  console.log(`Visit http://localhost:${port} to start the OAuth flow.`);
});
