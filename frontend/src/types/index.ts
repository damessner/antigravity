export type UserRole = "admin" | "teacher" | "pupil" | "lernwerkstatt";

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole | string; // Relaxed for API compatibility, but we should aim for strict
  requires_password_change?: boolean;
  isUpdatingRole?: boolean;
}

export interface SchoolClass {
  id: number;
  name: string;
}

export interface Pupil {
  id: number;
  name: string;
  username: string;
  class_id?: number;
  class_name?: string;
  room_id?: number;
  arrived_status?: boolean;
  active_comment?: string;
  timer_minutes?: number;
  timer_started_at?: string;
  timer_started_at_ms?: number;
}

export interface Room {
  id: number;
  name: string;
  capacity?: number;
}

export interface Note {
  id: number;
  pupil_id: number;
  teacher_id: number;
  category: string;
  content: string;
  created_at: string;
  teacher_name?: string;
  pupil_name?: string;
}
