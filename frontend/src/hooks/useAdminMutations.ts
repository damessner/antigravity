import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAuth } from "@/utils/fetchAuth";
import { User, SchoolClass, Pupil, Room } from "@/types";

interface CreateUserInput {
  username: string;
  full_name: string;
  role: string;
}

interface CreatePupilInput {
  full_name: string;
  class_id: number;
}

interface RollbackContext<T> {
  previousData?: T[];
}

export function useAdminMutations() {
  const queryClient = useQueryClient();

  // --- User Mutations ---
  const createUser = useMutation({
    mutationFn: async (user: CreateUserInput) => {
      const { data } = await fetchAuth("/api/users", { method: "POST", body: JSON.stringify(user) });
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Benutzer "${data.user.full_name}" erstellt!`, {
        description: `Temporäres Passwort: ${data.tempPassword}`,
        duration: 10000,
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => toast.error("Benutzer konnte nicht erstellt werden", {
      description: err instanceof Error ? err.message : "Bitte Eingaben prüfen und erneut versuchen."
    }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: number) => {
      await fetchAuth(`/api/users/${id}`, { method: "DELETE" });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "users"] });
      const previousUsers = queryClient.getQueryData<User[]>(["admin", "users"]);
      queryClient.setQueryData(["admin", "users"], (old: User[] = []) => old.filter(u => u.id !== id));
      return { previousData: previousUsers } as RollbackContext<User>;
    },
    onError: (err, id, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["admin", "users"], context.previousData);
      }
      toast.error("Löschen fehlgeschlagen", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  // --- Class Mutations ---
  const createClass = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await fetchAuth("/api/classes", { method: "POST", body: JSON.stringify({ name }) });
      return data;
    },
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: ["classes"] });
      const previousClasses = queryClient.getQueryData<SchoolClass[]>(["classes"]);
      queryClient.setQueryData(["classes"], (old: SchoolClass[] = []) => [
        ...old,
        { id: Math.random(), name } // Optimistic temp id
      ]);
      return { previousData: previousClasses } as RollbackContext<SchoolClass>;
    },
    onError: (err, name, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["classes"], context.previousData);
      }
      toast.error("Klasse konnte nicht erstellt werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["classes"] }),
  });

  // --- Pupil Mutations ---
  const createPupil = useMutation({
    mutationFn: async (pupil: CreatePupilInput) => {
      const { data } = await fetchAuth("/api/pupils", { method: "POST", body: JSON.stringify(pupil) });
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Schülerkonto für "${data.pupil.name}" erstellt!`, {
        description: `Login: ${data.username} | Passwort: ${data.tempPassword}`,
        duration: 15000,
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "pupils"] });
    },
  });

  const deletePupil = useMutation({
    mutationFn: async (id: number) => {
      await fetchAuth(`/api/pupils/${id}`, { method: "DELETE" });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "pupils"] });
      const previousPupils = queryClient.getQueryData<Pupil[]>(["admin", "pupils"]);
      queryClient.setQueryData(["admin", "pupils"], (old: Pupil[] = []) => old.filter(p => p.id !== id));
      return { previousData: previousPupils } as RollbackContext<Pupil>;
    },
    onError: (err, id, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["admin", "pupils"], context.previousData);
      }
      toast.error("Schüler konnte nicht gelöscht werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "pupils"] }),
  });

  // --- Room Mutations ---
  const createRoom = useMutation({
    mutationFn: async (name: string) => {
      const { data } = await fetchAuth("/api/setup/rooms", { method: "POST", body: JSON.stringify({ name }) });
      return data;
    },
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "rooms"] });
      const previousRooms = queryClient.getQueryData<Room[]>(["admin", "rooms"]);
      queryClient.setQueryData(["admin", "rooms"], (old: Room[] = []) => [
        ...old,
        { id: Math.random(), name }
      ]);
      return { previousData: previousRooms } as RollbackContext<Room>;
    },
    onError: (err, name, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["admin", "rooms"], context.previousData);
      }
      toast.error("Raum konnte nicht erstellt werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen."
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "rooms"] }),
  });

  return {
    createUser,
    deleteUser,
    createClass,
    createPupil,
    deletePupil,
    createRoom,
  };
}
