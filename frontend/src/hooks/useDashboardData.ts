"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl } from "@/utils/apiDiscovery";
import { Pupil, Room, SchoolClass, Subject, SubjectTag, User } from "@/types";

interface DashboardState {
  rooms: Room[];
  pupils: Pupil[];
  subjects: Subject[];
  subject_tags: SubjectTag[];
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
  const queryClient = useQueryClient();

  const stateQuery = useQuery({
    queryKey: ["dashboardState"],
    queryFn: () => fetchDashboardState(token!),
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
  });

  const classesQuery = useQuery({
    queryKey: ["classes"],
    queryFn: () => fetchClasses(token!),
    enabled: !!token,
    staleTime: 60 * 60 * 1000,
  });

  // Admin specific queries
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json() as Promise<User[]>;
    },
    enabled: !!token,
  });

  const pupilsQuery = useQuery({
    queryKey: ["admin", "pupils"],
    queryFn: async () => {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/pupils`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json() as Promise<Pupil[]>;
    },
    enabled: !!token,
  });

  const roomsQuery = useQuery({
    queryKey: ["admin", "rooms"],
    queryFn: async () => {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/setup/rooms`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json() as Promise<Room[]>;
    },
    enabled: !!token,
  });

  return {
    state: stateQuery.data,
    classes: classesQuery.data || [],
    users: usersQuery.data || [],
    pupils: pupilsQuery.data || [],
    rooms: roomsQuery.data || [],
    isLoading: stateQuery.isLoading || classesQuery.isLoading || usersQuery.isLoading || pupilsQuery.isLoading || roomsQuery.isLoading,
    isError: stateQuery.isError || classesQuery.isError || usersQuery.isError || pupilsQuery.isError || roomsQuery.isError,
    error: stateQuery.error || classesQuery.error || usersQuery.error || pupilsQuery.error || roomsQuery.error,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboardState"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    }
  };
}
