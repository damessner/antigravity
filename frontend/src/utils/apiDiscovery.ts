/**
 * Global API Discovery Helper
 * Dynamically computes the backend API and WebSocket base URLs based on the browser's current address bar location.
 * Ensures 100% network-agnostic zero-config operation across home routers, Proxmox VMs, and school hardware.
 */

export const getApiUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  
  // Fallback for development/local environments where the proxy might not be reachable
  // or for devices (iPads) connecting via LAN where the hardcoded "backend" hostname fails.
  if (typeof window !== "undefined") {
    // If we are on localhost, assume the backend is also on localhost:4000
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:4000";
    }
    // Otherwise, try the same host but port 4000 (common for this setup)
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  // Empty base as a last resort to use same-origin proxy
  return "";
};

export const getWsUrl = (): string => {
  const configuredWs = process.env.NEXT_PUBLIC_WS_URL?.trim();
  if (configuredWs) return configuredWs.replace(/\/+$/, "");
  const configuredApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredApi) return configuredApi.replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    // Mirror the same logic as getApiUrl() so the WebSocket always reaches
    // the backend (port 4000), not the frontend (port 3000).
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "http://localhost:4000";
    }
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "";
};
