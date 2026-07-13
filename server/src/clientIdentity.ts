import { isIP } from "node:net";
import type { Socket } from "socket.io";

type SocketWithHandshake = Pick<Socket, "handshake">;

function normalizeIp(value: string): string | null {
  const candidate = value.trim();
  const mappedIpv4 = candidate.toLowerCase().startsWith("::ffff:") ? candidate.slice(7) : candidate;
  if (isIP(mappedIpv4) === 0) return null;
  return mappedIpv4.toLowerCase();
}

function isTrustedLoopbackProxy(address: string): boolean {
  const normalized = normalizeIp(address);
  return normalized === "127.0.0.1" || normalized === "::1";
}

function getRightmostForwardedAddress(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header.at(-1) : header;
  if (!value) return null;
  const separator = value.lastIndexOf(",");
  return normalizeIp(value.slice(separator + 1));
}

/**
 * Resolve the network identity observed by the trusted local reverse proxy.
 *
 * Production binds Node to 127.0.0.1 and nginx places its observed peer at
 * the right edge of X-Forwarded-For. That value is therefore authoritative;
 * client-supplied values can only appear to its left. Non-loopback peers
 * never get to influence their identity through forwarding headers.
 */
export function getSocketClientIdentity(socket: SocketWithHandshake): string {
  const peerAddress = normalizeIp(socket.handshake.address) ?? socket.handshake.address;
  if (!isTrustedLoopbackProxy(socket.handshake.address)) return peerAddress;

  return getRightmostForwardedAddress(socket.handshake.headers["x-forwarded-for"]) ?? peerAddress;
}
