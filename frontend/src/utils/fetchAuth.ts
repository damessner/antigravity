import { getApiUrl } from "@/utils/apiDiscovery";

export const fetchAuth = async (path: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("token");
  const apiUrl = getApiUrl();
  
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...options.headers,
  };

  const res = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Fehler bei Anfrage: ${res.statusText}`);
  }
  return { res, data };
};
