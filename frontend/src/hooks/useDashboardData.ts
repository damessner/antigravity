"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAuth } from "@/utils/fetchAuth";
import { Pupil, Room, SchoolClass, Subject, SubjectTag, User } from "@/types";


interface DashboardState {
  rooms: Room[];
  pupils: Pupil[];
  subjects: Subject[];
  subject_tags: SubjectTag[];
  settings?: Record<string, string>;
}



const EMPTY_ARRAY: any[] = [];

export function useDashboardData(token: string | null) {
  const queryClient = useQueryClient();

  const stateQuery = useQuery({
    queryKey: ["dashboardState"],
    queryFn: async () => {
      const { data } = await fetchAuth("/api/state");
      return data as DashboardState;
    },
    enabled: !!token,
    staleTime: 30 * 1000,         // 30 s — stale quickly so refreshes show live data
    refetchOnWindowFocus: true,    // re-sync when teacher switches back to this tab
  });

  const classesQuery = useQuery({
    queryKey: ["classes"],
    queryFn: async () => {
      const { data } = await fetchAuth("/api/classes");
      return data as SchoolClass[];
    },
    enabled: !!token,
    staleTime: 60 * 60 * 1000,
  });


  // Admin specific queries
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data } = await fetchAuth("/api/users");
      return data as User[];
    },
    enabled: !!token,
  });

  const pupilsQuery = useQuery({
    queryKey: ["admin", "pupils"],
    queryFn: async () => {
      const { data } = await fetchAuth("/api/pupils");
      return data as Pupil[];
    },
    enabled: !!token,
  });

  const roomsQuery = useQuery({
    queryKey: ["admin", "rooms"],
    queryFn: async () => {
      const { data } = await fetchAuth("/api/setup/rooms");
      return data as Room[];
    },
    enabled: !!token,
  });


  return {
    state: stateQuery.data,
    settings: stateQuery.data?.settings || {},
    classes: classesQuery.data || EMPTY_ARRAY,
    users: usersQuery.data || EMPTY_ARRAY,
    pupils: pupilsQuery.data || EMPTY_ARRAY,
    rooms: roomsQuery.data || EMPTY_ARRAY,
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

