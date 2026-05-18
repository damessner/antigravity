/**
 * Global API Discovery Helper
 * Dynamically computes the backend API and WebSocket base URLs based on the browser's current address bar location.
 * Ensures 100% network-agnostic zero-config operation across home routers, Proxmox VMs, and school hardware.
 */

export const getApiUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // Always prefer the frontend's same-origin proxy so browsers never need direct
  // access to backend port 4000 during normal login or API usage.
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
      return "ws://localhost:4000";
    }

    const isLocalIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(window.location.hostname) || window.location.hostname.endsWith('.local');
    const wsProtocol = isLocalIp ? "ws:" : (window.location.protocol === "https:" ? "wss:" : "ws:");
    
    return `${wsProtocol}//${window.location.hostname}:4000`;
  }
  return "";
};
