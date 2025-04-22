# Flow NFT Sales Twitter Bot

Monitors certain Flow blockchain sales events and tweets about them if they meet price thresholds defined in `config.js`, posting to potentially two different Twitter accounts based on the NFT collection and price.

## Events Watched

This bot listens for various sale, offer completion, and direct marketplace purchase events on the Flow blockchain, including standard marketplaces like NFTStorefrontV2, specific implementations like Flowty, and direct purchases on platforms like TopShot.

For the precise, up-to-date list of contract addresses and event names being monitored, please see the `events` array within the `subscribeToEvents` call in the `index.js` file.

## Features

- Watches specific sale, offer, and purchase events on Flow, including NFTStorefrontV2 (standard & Flowty) and TopShot markets.
- Checks sale price (converted to USD) against thresholds defined in `config.js`.
- **Dual Bot Posting:** (This instance runs on Google Cloud Platform)
  - Posts high-value Pinnacle sales (above `PINNACLESALESBOT_THRESHOLD_PINNACLE`) to a dedicated Pinnacle Twitter account: [@PinnaclePinBot](https://x.com/PinnaclePinBot).
  - Posts sales from all enabled collections (including Pinnacle sales above `FLOWSALESBOT_THRESHOLD_PINNACLE`) to a general Flow Sales Twitter account: [@FlowSalesBot](https://x.com/FlowSalesBot), using collection-specific thresholds (`FLOWSALESBOT_THRESHOLD_*`).
- Only processes sales for NFT collections enabled in `config.js`.
- Posts sale details (NFT info, price, buyer/seller, specific marketplace link or Flowscan link) to the appropriate Twitter bot.
- Includes NFT image in tweet where possible.
- Optional debug mode (`DEBUG_LOG_ALL_EVENTS` in `config.js`) to log all raw event data for processed transactions.
- Basic duplicate prevention (ignores already tweeted TX IDs during a single run).

## Setup

1.  **Prerequisites:**

    - Node.js (v16+ recommended)
    - npm or yarn

2.  **Clone & Install:**

    ```bash
    git clone [https://github.com/LibruaryNFT/social-media-poster](https://github.com/LibruaryNFT/social-media-poster)
    cd social-media-poster
    npm install
    # or yarn install
    ```

3.  **Configure `.env`:**
    Create a `.env` file in the root folder. Add your Twitter API v2 credentials:

    - **App Credentials:** Required for the application itself.
    - **Pinnacle Bot Credentials:** Access Token/Secret for the [@PinnaclePinBot](https://x.com/PinnaclePinBot) account.
    - **Flow Sales Bot Credentials:** Access Token/Secret for the [@FlowSalesBot](https://x.com/FlowSalesBot) account.

    ```dotenv
    # App Credentials (Required)
    TWITTER_API_KEY=YOUR_APP_KEY
    TWITTER_API_SECRET=YOUR_APP_SECRET

    # Pinnacle Bot User Credentials (Required)
    PINNACLEPINBOT_ACCESS_TOKEN=YOUR_PINNACLE_BOT_ACCESS_TOKEN
    PINNACLEPINBOT_ACCESS_SECRET=YOUR_PINNACLE_BOT_ACCESS_SECRET

    # Flow Sales Bot User Credentials (Required)
    FLOWSALESBOT_ACCESS_TOKEN=YOUR_FLOWSALES_BOT_ACCESS_TOKEN
    FLOWSALESBOT_ACCESS_SECRET=YOUR_FLOWSALES_BOT_ACCESS_SECRET
    ```

4.  **Configure `config.js`:**
    - **Edit `config.js` directly.** This file is central to the bot's behavior.
    - Set your desired USD thresholds using the **prefixed names**:
      - `PINNACLESALESBOT_THRESHOLD_PINNACLE`: Minimum price for the _Pinnacle Bot_ to tweet a Pinnacle sale.
      - `FLOWSALESBOT_THRESHOLD_PINNACLE`: Minimum price for the _Flow Sales Bot_ to tweet a Pinnacle sale.
      - `FLOWSALESBOT_THRESHOLD_TOPSHOT`, `_TOPSHOT_PACKS`, `_NFL_PACKS`, `_NFL_ALLDAY`, `_HOTWHEELS`, `_OTHERS`: Minimum price for the _Flow Sales Bot_ to tweet sales from these respective collections.
    - Modify the `ENABLED_COLLECTIONS` array to turn specific handlers on or off (e.g., remove `"TOPSHOT_PACK"` if you don't want to tweet about those, ensure `"NFL_ALLDAY"` is present if desired). The names here correspond to the threshold keys and internal logic.
    - Set the `DEBUG_LOG_ALL_EVENTS` flag directly to `true` or `false`. If `true`, raw event data for all processed transactions will be logged to the console. Defaults to `false`.

## Running

Once configured, start the bot:

```bash
node index.js
```
