// @sap/xsenv ships no TypeScript declarations of its own. When that happens for a
// package you can't change, you write a small "ambient module declaration" like this
// one, telling TypeScript "trust me, this module exists, here's its rough shape" —
// rather than TypeScript refusing to compile at all. This is a very common real-world
// pattern once you start using older/internal/enterprise npm packages with TS.
declare module "@sap/xsenv" {
  // We only describe the one function we actually call. `any` here is a deliberate,
  // narrow escape hatch — better than typing the whole package, which we don't use.
  export function getServices(filter: Record<string, unknown>): Record<string, any>;
  const _default: { getServices: typeof getServices };
  export default _default;
}
