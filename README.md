# Flow NFT Sales Twitter Bot

Monitors certain Flow blockchain sales events and tweets about them if they meet price thresholds defined in `config.js`.

## Events Watched

This bot specifically listens for these Flow events:

- `A.4eb8a10cb9f87357.NFTStorefrontV2.ListingCompleted`
- `A.b8ea91944fd51c43.OffersV2.OfferCompleted`
- `A.c1e4f4f4c4257510.TopShotMarketV2.MomentPurchased`
- `A.c1e4f4f4c4257510.TopShotMarketV3.MomentPurchased`

## Features

- Watches specific sale/purchase events on Flow.
- Checks sale price (converted to USD) against thresholds in `config.js`.
- Only processes sales for NFT collections enabled in `config.js`.
- Posts sale details (NFT info, price, buyer/seller, Flowscan link) to Twitter.
- Includes NFT image in tweet where possible.
- Basic duplicate prevention (ignores already tweeted TX IDs during a single run).

## Setup

1.  **Prerequisites:**

    - Node.js (v16+ recommended)
    - npm or yarn

2.  **Clone & Install:**

    ```bash
    git clone <your-repo-url>
    cd <your-repo-directory>
    npm install
    ```

3.  **Configure `.env`:**
    Create a `.env` file in the root folder. Add your Twitter API v2 (App Key/Secret + Access Token/Secret for posting):

    ```dotenv
    TWITTER_API_KEY=YOUR_APP_KEY
    TWITTER_API_SECRET=YOUR_APP_SECRET
    TWITTER_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
    TWITTER_ACCESS_SECRET=YOUR_ACCESS_SECRET
    ```

4.  **Configure `config.js`:**
    - **Edit `config.js` directly.** This file is central to the bot's behavior.
    - Set your desired USD `PRICE_THRESHOLD_` values for different collection types.
    - Modify the `ENABLED_COLLECTIONS` array to turn specific handlers on or off (e.g., remove `"TOPSHOT_PACK"` if you don't want to tweet about those).

## Running

Once configured, start the bot:

```bash
node index.js
```
