import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAuth } from "@/utils/fetchAuth";
import { User, SchoolClass, Pupil, Room } from "@/types";

export function useAdminMutations() {
  const queryClient = useQueryClient();

  // --- User Mutations ---
  const createUser = useMutation({
    mutationFn: async (user: any) => {
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
    onError: (err: any) => toast.error("Fehler", { description: err.message }),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: number) => {
      await fetchAuth(`/api/users/${id}`, { method: "DELETE" });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "users"] });
      const previousUsers = queryClient.getQueryData<User[]>(["admin", "users"]);
      queryClient.setQueryData(["admin", "users"], (old: User[] = []) => old.filter(u => u.id !== id));
      return { previousUsers };
    },
    onError: (err, id, context: any) => {
      queryClient.setQueryData(["admin", "users"], context.previousUsers);
      toast.error("Löschen fehlgeschlagen", { description: err.message });
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
      await queryClient.cancelQueries({ queryKey: ["admin", "classes"] });
      const previousClasses = queryClient.getQueryData<SchoolClass[]>(["admin", "classes"]);
      queryClient.setQueryData(["admin", "classes"], (old: SchoolClass[] = []) => [
        ...old,
        { id: Math.random(), name } // Optimistic temp id
      ]);
      return { previousClasses };
    },
    onError: (err, name, context: any) => {
      queryClient.setQueryData(["admin", "classes"], context.previousClasses);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "classes"] }),
  });

  // --- Pupil Mutations ---
  const createPupil = useMutation({
    mutationFn: async (pupil: any) => {
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
      return { previousPupils };
    },
    onError: (err, id, context: any) => {
      queryClient.setQueryData(["admin", "pupils"], context.previousPupils);
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
      return { previousRooms };
    },
    onError: (err, name, context: any) => {
      queryClient.setQueryData(["admin", "rooms"], context.previousRooms);
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
