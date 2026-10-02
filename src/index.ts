// ============================================================================
// This is a TEACHING copy of src/index.js, rewritten in TypeScript.
// It is NOT wired into `npm start` / `cf push` yet — the deployed app still
// runs the plain-JavaScript src/index.js. Think of this file as a sandbox to
// learn TypeScript syntax against code you already understand.
//
// The single biggest idea in TypeScript: everything you already write in
// JavaScript still works. TS just lets you ADD type annotations on top,
// which the "tsc" compiler checks BEFORE your code ever runs — catching
// whole categories of bugs (wrong argument types, typos in property names,
// forgetting to handle `null`) at write-time instead of at runtime.
// ============================================================================

// Regular ES module imports, identical to JavaScript. TypeScript doesn't
// change *how* you import things — it changes what the editor/compiler knows
// about what you imported.
import express, { type Request, type Response, type RequestHandler } from "express";
// ^ Notice `type Request` / `type Response` / `type RequestHandler` — the `type` keyword
//   here means "I'm only importing this for type-checking, it has no runtime existence."
//   Express ships its own .d.ts (type declaration) files, so these types come for free.

import passport from "passport";
import xsenv from "@sap/xsenv";
import xssec from "@sap/xssec";

// Destructuring works exactly like JS. @sap/xssec ships its own .d.ts files too
// (we found this out during the BTP deployment debugging — the useful JWTStrategy
// class lives under the "v3" legacy namespace in this version of the package).
const { JWTStrategy } = xssec.v3;

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// ^ Note the ".js" extension in these import paths even though the source is TypeScript.
//   This project uses Node's native ESM resolution ("NodeNext" in tsconfig.json), which
//   requires the *runtime* file extension in relative/package imports — a TypeScript-specific
//   quirk you only hit once you understand module resolution modes.

import { z } from "zod";
// ^ zod is a "schema validation" library. It lets you describe a shape of data (e.g. "a
//   positive number") and it both VALIDATES values against that shape at runtime AND
//   gives TypeScript a precise compile-time type for free (via z.infer<...>, used below).

import { convertCurrency } from "./currency.js";
import { getCurrentWeather } from "./weather.js";
// ^ These still point at the .js files — we haven't converted currency.js/weather.js to
//   TypeScript in this teaching pass, and that's fine: TS and JS files happily coexist in
//   the same project. (When we do the full migration later, these become .ts too.)

/**
 * `configureAuth` has an explicit RETURN TYPE annotation: `: RequestHandler | null`.
 * This is a function signature, same as JS, but TypeScript now enforces that every
 * `return` statement inside this function produces either an Express RequestHandler
 * or `null` — nothing else. If you accidentally `return 42;` somewhere, TS refuses
 * to compile.
 */
function configureAuth(): RequestHandler | null {
  try {
    // `xsenv.getServices` is typed loosely (returns `any`) by @sap/xsenv's own types,
    // so TypeScript can't fully verify the shape of `uaa` here — this is realistic:
    // plenty of real-world packages (especially internal/enterprise ones) have
    // incomplete or "good enough" types. TS doesn't block you; it just can't help
    // you here the way it does with zod-typed values below.
    const { uaa } = xsenv.getServices({ uaa: { tag: "xsuaa" } });

    // The .d.ts for JWTStrategy declares its 2nd parameter ("forceType") as required,
    // even though it's genuinely optional at runtime — a mismatch between the published
    // types and actual behavior, which does happen with real packages. Passing
    // `undefined` explicitly satisfies the compiler without changing behavior.
    passport.use(new JWTStrategy(uaa, undefined));

    // `passport.authenticate(...)` returns an Express middleware function, which
    // matches our declared return type `RequestHandler`.
    return passport.authenticate("JWT", { session: false });
  } catch (error: unknown) {
    // `unknown` (not `any`) is the TYPE-SAFE way to catch errors in TypeScript.
    // `any` would let you call ANY method on `error` with no checking at all — `unknown`
    // forces you to narrow the type first (the `instanceof Error` check below) before
    // you're allowed to access `.message`. This is the same defensive pattern the
    // original JS already used; TS just makes it compiler-enforced instead of a
    // convention you have to remember.
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[auth] No bound XSUAA service found (joule-mcp-xsuaa) — running /mcp without authentication. Cause: ${message}`,
    );
    return null;
  }
}

/**
 * A plain TypeScript "interface" describing the shape of data our tool handlers
 * return. MCP's SDK already exports its own types for this, but defining our own
 * small interface here is a good teaching example of the `interface` keyword:
 * it's purely a compile-time description of an object's shape — it generates
 * ZERO runtime code (unlike a `class`).
 */
interface ToolTextResult {
  content: Array<{ type: "text"; text: string }>;
  // The `?` makes this field OPTIONAL — a value of this interface's type is valid
  // whether or not `isError` is present at all.
  isError?: boolean;
  // MCP's own SDK type allows arbitrary extra string-keyed properties on this object
  // (an "index signature"). Our interface returns plain object literals with only
  // `content`/`isError`, which is safe at runtime — but to let TypeScript treat our
  // narrower interface as assignable to the SDK's wider one, we have to declare that
  // compatibility explicitly here too.
  [key: string]: unknown;
}
// Note: `type: "text"` above isn't the TS keyword `type` — it's a "string literal type."
// Instead of saying "type must be a string", it says "type must be exactly the string
// 'text'". This is how MCP's own SDK distinguishes different kinds of content blocks
// (text vs image vs resource) in a way the compiler can check.

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "joule-mcp-tools",
    version: "1.0.0",
  });

  // zod's schema objects double as TypeScript types. `z.infer<typeof schema>` reads
  // the runtime validation rules and produces the matching compile-time type — so the
  // shape of `amount`/`from`/`to` below is checked against this schema automatically,
  // with no duplication between "the validation rules" and "the TypeScript type."
  const convertCurrencyInput = {
    amount: z.number().positive().describe("The amount to convert"),
    from: z.string().length(3).describe("The source currency ISO code, e.g. USD"),
    to: z.string().length(3).describe("The target currency ISO code, e.g. EUR"),
  };

  server.registerTool(
    "convert_currency",
    {
      description:
        "Convert an amount from one currency to another using live exchange rates (ISO 4217 currency codes, e.g. USD, EUR, INR, GBP, JPY).",
      inputSchema: convertCurrencyInput,
    },
    // Because `convertCurrencyInput` uses zod schemas, TypeScript (via the MCP SDK's
    // own generic types) already knows `amount` is a `number` and `from`/`to` are
    // `string`s here — you get autocomplete and type errors on this destructured
    // parameter without writing a single explicit type annotation yourself. This is
    // the payoff of combining zod + TypeScript: one schema, two checks (runtime +
    // compile-time) for free.
    async ({ amount, from, to }): Promise<ToolTextResult> => {
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
      } catch (error: unknown) {
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
    async ({ location }): Promise<ToolTextResult> => {
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
      } catch (error: unknown) {
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

const authenticate: RequestHandler | null = configureAuth();

// `app.all` is typed by @types/express to require actual RequestHandler functions.
// The spread `...(authenticate ? [authenticate] : [])` is identical JS/TS — TypeScript
// just confirms that whatever ends up in that array really is a valid RequestHandler.
app.all("/mcp", ...(authenticate ? [authenticate] : []), async (req: Request, res: Response): Promise<void> => {
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

// `process.env.PORT` is typed as `string | undefined` by @types/node (environment
// variables might not be set!). `Number(undefined)` evaluates to `NaN`, and
// `NaN || 3000` is `3000` — so this line is actually relying on the SAME runtime
// behavior as the JS version, but TypeScript's types make the "this could be
// undefined" possibility visible instead of implicit.
const port: number = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Joule MCP tools server listening on port ${port} (POST http://localhost:${port}/mcp)`);
});
