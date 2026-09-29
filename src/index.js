import express from "express";
import passport from "passport";
import xsenv from "@sap/xsenv";
import xssec from "@sap/xssec";

const { JWTStrategy } = xssec;
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { convertCurrency } from "./currency.js";
import { getCurrentWeather } from "./weather.js";

function configureAuth() {
  try {
    const { uaa } = xsenv.getServices({ uaa: { tag: "xsuaa" } });
    passport.use(new JWTStrategy(uaa));
    return passport.authenticate("JWT", { session: false });
  } catch {
    console.warn("[auth] No bound XSUAA service found (joule-mcp-xsuaa) — running /mcp without authentication.");
    return null;
  }
}

function createMcpServer() {
  const server = new McpServer({
    name: "joule-mcp-tools",
    version: "1.0.0",
  });

  server.registerTool(
    "convert_currency",
    {
      description:
        "Convert an amount from one currency to another using live exchange rates (ISO 4217 currency codes, e.g. USD, EUR, INR, GBP, JPY).",
      inputSchema: {
        amount: z.number().positive().describe("The amount to convert"),
        from: z.string().length(3).describe("The source currency ISO code, e.g. USD"),
        to: z.string().length(3).describe("The target currency ISO code, e.g. EUR"),
      },
    },
    async ({ amount, from, to }) => {
      try {
        const { rate, converted } = await convertCurrency(amount, from, to);
        return {
          content: [
            {
              type: "text",
              text: `${amount} ${from.toUpperCase()} = ${converted} ${to.toUpperCase()} (rate: 1 ${from.toUpperCase()} = ${rate} ${to.toUpperCase()})`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Currency conversion failed: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_weather",
    {
      description:
        "Get the current weather for a city or place name (temperature, humidity, wind speed, and conditions).",
      inputSchema: {
        location: z.string().min(1).describe("City or place name, e.g. 'London' or 'Chennai, India'"),
      },
    },
    async ({ location }) => {
      try {
        const { place, temperatureC, humidityPercent, windSpeedKmh, condition } = await getCurrentWeather(location);
        return {
          content: [
            {
              type: "text",
              text: `Weather in ${place}: ${condition}, ${temperatureC}°C, humidity ${humidityPercent}%, wind ${windSpeedKmh} km/h`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Weather lookup failed: ${message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

const app = express();
app.use(express.json());
app.use(passport.initialize());

const authenticate = configureAuth();

app.all("/mcp", ...(authenticate ? [authenticate] : []), async (req, res) => {
  console.log(`[mcp] ${req.method} /mcp`);

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Joule MCP tools server listening on port ${port} (POST http://localhost:${port}/mcp)`);
});
