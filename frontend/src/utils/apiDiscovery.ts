/**
 * Global API Discovery Helper
 * Dynamically computes the backend API and WebSocket base URLs based on the browser's current address bar location.
 * Ensures 100% network-agnostic zero-config operation across home routers, Proxmox VMs, and school hardware.
 */

export const getApiUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  // Empty base keeps fetches relative (e.g. "/api/..."), enabling same-origin Next.js rewrites.
  return "";
};

export const getWsUrl = (): string => {
  const configuredWs = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (configuredWs) return configuredWs.replace(/\/+$/, "");
  const configuredApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredApi) return configuredApi.replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}`;
  }
  return "";
};
