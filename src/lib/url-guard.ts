// SSRF protection for server-side fetches of user-supplied URLs (recipe import).
//
// Blocks non-http(s) schemes, obvious internal hostnames, and any URL that
// resolves to a private / loopback / link-local / reserved IP — including the
// cloud metadata endpoint (169.254.169.254). DNS is resolved so a public-looking
// hostname that points at an internal address is also rejected.

import dns from "node:dns/promises";
import net from "node:net";

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n * 256) + o;
  }
  return n >>> 0;
}

function inRange4(ip: number, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

// Private, loopback, link-local, CGNAT, benchmarking, multicast, reserved.
const BLOCKED_V4 = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16",
  "198.18.0.0/15", "224.0.0.0/4", "240.0.0.0/4", "255.255.255.255/32",
];

/** True if the given IP literal is one we must never fetch from. */
export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const n = ipv4ToInt(ip);
    return n === null || BLOCKED_V4.some((c) => inRange4(n, c));
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4 address.
    const mapped = lower.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isBlockedIp(mapped[1]);
    if (/^f[cd]/.test(lower)) return true;   // unique-local fc00::/7
    if (/^fe[89ab]/.test(lower)) return true; // link-local fe80::/10
    return false; // other global IPv6 is allowed
  }
  return true; // not a valid IP literal → block
}

/**
 * Validate that a URL is safe to fetch server-side. Returns the parsed URL on
 * success; throws an Error (with a user-safe message) otherwise.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be imported");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("That address can't be imported");
  }

  // IP literal → check directly, no DNS needed.
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new Error("That address can't be imported");
    return url;
  }

  // Hostname → resolve and reject if ANY resolved address is internal
  // (defends against a public name pointing at a private IP).
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("Could not resolve that address");
  }
  if (addresses.length === 0) throw new Error("Could not resolve that address");
  for (const a of addresses) {
    if (isBlockedIp(a.address)) throw new Error("That address can't be imported");
  }

  return url;
}
