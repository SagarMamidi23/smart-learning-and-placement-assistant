import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * API_PROXY_TARGET (read at build time) is the API's public origin, e.g. https://slp-api.onrender.com. When set, the web server
 * forwards /api/v1/* to it, and the browser only ever talks to the web origin (build with NEXT_PUBLIC_API_URL=same-origin).
 * Needed on hosts like Render where web and API get sibling *.onrender.com domains: those are different sites, so SameSite=Lax
 * login cookies set by the API would not be sent back.
 */
const target = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");

/** @type {import('next').NextConfig} */
export default {
  output: "standalone",
  outputFileTracingRoot: root,
  transpilePackages: ["@slp/shared"],
  // The mentor streams its answer; compression would hold the stream back until it fills a buffer.
  compress: false,
  async rewrites() {
    return target ? [{ source: "/api/v1/:path*", destination: `${target}/api/v1/:path*` }] : [];
  },
};
