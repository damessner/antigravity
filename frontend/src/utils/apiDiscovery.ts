/**
 * Global API Discovery Helper
 * Dynamically computes the backend API and WebSocket base URLs based on the browser's current address bar location.
 * Ensures 100% network-agnostic zero-config operation across home routers, Proxmox VMs, and school hardware.
 */

export const getApiUrl = (): string => {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    return `${protocol}//${host}:4000`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
};

export const getWsUrl = (): string => {
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.hostname;
    return `${wsProtocol}//${host}:4000`;
  }
  return process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4000";
};
