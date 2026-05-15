"use client";

import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/utils/apiDiscovery";
import { Pupil, Room, SchoolClass } from "@/types";

interface DashboardState {
  rooms: Room[];
  pupils: Pupil[];
  subjects: any[];
  subject_tags: any[];
}

const fetchDashboardState = async (token: string): Promise<DashboardState> => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/state`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch dashboard state");
  return res.json();
};

const fetchClasses = async (token: string): Promise<SchoolClass[]> => {
  const apiUrl = getApiUrl();
  const res = await fetch(`${apiUrl}/api/classes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch classes");
  return res.json();
};

export function useDashboardData(token: string | null) {
  const stateQuery = useQuery({
    queryKey: ["dashboardState"],
    queryFn: () => fetchDashboardState(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const classesQuery = useQuery({
    queryKey: ["classes"],
    queryFn: () => fetchClasses(token!),
    enabled: !!token,
    staleTime: 60 * 60 * 1000, // 1 hour
  });

  return {
    state: stateQuery.data,
    classes: classesQuery.data,
    isLoading: stateQuery.isLoading || classesQuery.isLoading,
    isError: stateQuery.isError || classesQuery.isError,
    error: stateQuery.error || classesQuery.error,
    refetch: () => {
      stateQuery.refetch();
      classesQuery.refetch();
    }
  };
}
