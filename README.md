# Joule MCP Tools

A learning project: a small custom [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server exposing tools meant to be plugged into an SAP Joule Studio agent as a custom tool integration (instead of only using Joule's built-in tools).

Plain Node.js / JavaScript deployment, no Python anywhere in the stack. `src/index.ts` is a parallel, heavily-commented TypeScript teaching copy of `src/index.js` — it is not wired into `npm start`/`cf push`.

## What it does

Exposes three MCP tools:

- **`convert_currency`** — converts an amount between two ISO 4217 currency codes (e.g. `USD` → `EUR`) using live rates from the free [Frankfurter API](https://frankfurter.dev) (no API key required).
- **`get_weather`** — gets current weather (temperature, humidity, wind, conditions) for a city/place name, using the free [Open-Meteo API](https://open-meteo.com) (no API key required).
- **`get_world_news`** — gets the latest world news headlines (title, link, publish time) from the free [BBC World News RSS feed](https://feeds.bbci.co.uk/news/world/rss.xml) (no API key required).

## Project layout

- `src/currency.js` — Frankfurter API client (`getExchangeRate`, `convertCurrency`).
- `src/weather.js` — Open-Meteo geocoding + forecast client (`geocodeLocation`, `getCurrentWeather`).
- `src/news.js` — BBC World News RSS client (`getLatestWorldNews`), parses the feed's XML with no extra dependency.
- `src/index.js` — Express app that hosts the MCP server over the Streamable HTTP transport at `POST/GET/DELETE /mcp`, in stateless mode (no session store — each request gets a fresh server instance).
- `src/index.ts` / `tsconfig.json` / `src/types/sap-xsenv.d.ts` — TypeScript teaching copy of `index.js` (see comments inline); check it with `npx tsc --noEmit`.
- `manifest.yml` / `.cfignore` — Cloud Foundry deployment scaffold for SAP BTP.

## Run locally

```bash
npm install
npm run dev      # node --watch src/index.js, restarts on file changes
# or: npm start
```

The server listens on `http://localhost:3000/mcp` (or `$PORT` if set).

## Test it

### Automated smoke test

```bash
npm test
```

Runs [test/mcp-server.test.js](test/mcp-server.test.js) with Node's built-in test runner: spawns the server on a separate port, then exercises `tools/list` and `tools/call` for `convert_currency` (including an invalid-currency-code error case), `get_weather`, and `get_world_news` against the live Frankfurter/Open-Meteo/BBC APIs. Run this once locally before every `cf push`.

### With curl

```bash
# List available tools
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Call the currency tool
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"convert_currency","arguments":{"amount":100,"from":"USD","to":"EUR"}}}'

# Call the weather tool
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_weather","arguments":{"location":"London"}}}'

# Call the world news tool
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_world_news","arguments":{"limit":5}}}'
```

### With MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Point it at `http://localhost:3000/mcp` using the "Streamable HTTP" transport, then call `convert_currency` or `get_weather` from the UI.

## Deploy to Cloud Foundry (SAP BTP)

The server is protected with SAP XSUAA (Identity services) — it needs a bound XSUAA service instance before `cf push`, otherwise it falls back to running `/mcp` with no authentication (fine for local dev, logged as a warning; see `src/index.js`).

```bash
cf login

# One-time: create the XSUAA service instance from xs-security.json
cf create-service xsuaa application joule-mcp-xsuaa -c xs-security.json

cf push
```

This uses `manifest.yml` (`nodejs_buildpack`, `npm start`, 256M memory, bound to the `joule-mcp-xsuaa` service). Note the route URL `cf` prints after push (e.g. `https://joule-mcp-currency-converter.<your-landscape>.hana.ondemand.com`) — you'll need it in the next step.

Then create a service key to get the OAuth2 client credentials for the destination:

```bash
cf create-service-key joule-mcp-xsuaa joule-mcp-destination-key
cf service-key joule-mcp-xsuaa joule-mcp-destination-key
```

Note the `clientid`, `clientsecret`, and `url` (the XSUAA token endpoint) from the output — you'll need them below.

## Connect it to a Joule Studio agent

1. **BTP Cockpit → Connectivity → Destinations → New Destination**
   - URL: the Cloud Foundry route from above, **without** the `/mcp` suffix (Joule Studio appends that itself).
   - Authentication: `OAuth2ClientCredentials`.
     - Token Service URL: the `url` from the service key, with `/oauth/token` appended.
     - Client ID / Client Secret: `clientid` / `clientsecret` from the service key.
   - Add the additional property that marks the destination as MCP-capable (required for Joule Studio to list it as an MCP server option).
   - Save, then check the connection.

2. **Joule Studio → Agent Builder → your agent → Add MCP Server**
   - Select the destination you just created. Joule Studio will discover `convert_currency` and `get_weather` automatically via `tools/list`.

3. **Agent instructions** — tell the agent when to use each tool, e.g.:
   > "When the user asks to convert an amount from one currency to another, call the `convert_currency` tool with `amount`, `from`, and `to` as ISO currency codes, and report the converted amount and rate back to the user. When the user asks about current weather in a city or place, call the `get_weather` tool with `location` and report the temperature, conditions, humidity, and wind speed back to the user."

4. **Test** — use Joule Studio's built-in agent tester and confirm the tool-call trace shows `convert_currency` / `get_weather` being invoked with the right arguments.

> **Note:** this integration step needs a publicly reachable deployment (Cloud Foundry route + BTP destination) — it can't be done against `localhost`. Local testing above is the "does the server work" step; treat the Joule Studio wiring as a separate follow-up once you're ready to `cf push`.

## Notes / gotchas

- Keep tool responses small — Joule Studio caps individual tool responses at ~10KB (not a concern here).
- The stateless transport mode means there's no session state between requests — fine for a single simple tool, but if you add tools that need multi-step conversational state later, switch to a stateful `sessionIdGenerator`.
- If Frankfurter returns an unsupported currency code, the tool returns an MCP tool error (`isError: true`) rather than crashing the server.
- `/mcp` is protected by XSUAA (`src/index.js`, `xs-security.json`): requests need a valid Bearer token minted for the `joule-mcp-tools` XSUAA app. Without a service instance bound (e.g. running `npm run dev` locally), the server logs a warning and serves `/mcp` unauthenticated instead of crashing — deliberate for local testing, not for production use.
- AI Launchpad isn't part of this wiring — it's a separate SAP service (mainly Generative AI Hub / orchestration). Only relevant here as an entitlement check if your subaccount's Joule/Gen AI features aren't showing up.
