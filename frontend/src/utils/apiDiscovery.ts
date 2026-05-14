/**
 * Global API Discovery Helper
 * Dynamically computes the backend API and WebSocket base URLs based on the browser's current address bar location.
 * Ensures 100% network-agnostic zero-config operation across home routers, Proxmox VMs, and school hardware.
 */

export const getApiUrl = (): string => {
  if (typeof window !== "undefined") {
    // Return empty string to route fetch requests through the Next.js frontend proxy (port 3000)
    return "";
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
};

export const getWsUrl = (): string => {
  if (typeof window !== "undefined") {
    // Return empty string to route Socket.io real-time traffic through the Next.js frontend proxy (port 3000)
    return "";
  }
  return process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4000";
};
