import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    return false;
  }
  return false;
}

/**
 * Rejects raw-footage import URLs that resolve to loopback, private,
 * link-local, or cloud-metadata addresses (SSRF protection). The worker
 * fetches this URL server-side on the user's behalf — without this
 * check, a submitted "raw footage URL" of e.g. http://169.254.169.254/...
 * or an internal service would have the worker fetch it blindly.
 *
 * Known limitation: this resolves DNS once, here; fetch() resolves again
 * when it actually connects, so a DNS answer that changes between the two
 * (DNS rebinding) isn't caught. Full protection needs a custom fetch
 * agent that pins the resolved IP — not built here; this covers the
 * realistic case (a URL that is straightforwardly internal), not a
 * determined attacker controlling DNS timing.
 */
export async function assertFootageUrlIsSafe(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Raw footage URL is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Raw footage URL must be http:// or https://.");
  }
  if (BLOCKED_HOSTNAMES.has(url.hostname.toLowerCase())) {
    throw new Error("Raw footage URL points at a disallowed host.");
  }
  if (net.isIP(url.hostname)) {
    if (isPrivateOrReservedIp(url.hostname)) {
      throw new Error("Raw footage URL resolves to a private/internal address, which is not allowed.");
    }
    return;
  }
  const addresses = await dns.lookup(url.hostname, { all: true });
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error("Raw footage URL resolves to a private/internal address, which is not allowed.");
    }
  }
}
