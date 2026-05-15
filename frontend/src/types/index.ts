import { ScaleType } from "../components/gradeUtils";

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
  note_text: string;
  sentiment: "positive" | "neutral" | "negative";
  is_visible_to_pupil: boolean;
  auto_source?: string;
  created_at: string;
  teacher_id: number;
  teacher_name?: string;
}

export interface Subject {
  id: number;
  name: string;
  abbreviation: string;
  class_id: number;
  teacher_id: number;
  second_teacher_id?: number | null;
  projection_visible?: boolean;
}

export interface SubjectTag {
  id: number;
  subject_id: number;
  name: string;
  color?: string;
}

export interface ColumnMetadata {
  id?: number;
  name: string;
  info_text?: string | null;
  deadline?: string | null;
  is_visible?: boolean;
}

export interface Category {
  id: number;
  subject_id: number;
  name: string;
  weight_percentage: number;
  scale_type: ScaleType | string;
  is_self_directed: boolean;
  isLocked?: boolean;
  column_metadata?: ColumnMetadata[];
}


export interface Grade {
  id?: number;
  category_id: number;
  pupil_id: number;
  assessment_name: string;
  grade_value: string | number | null;
  is_visible: boolean;
  created_at?: string;
}

export interface PupilTag {
  id: number;
  pupil_id: number;
  subject_id?: number;
  tier_tag: string;
  color?: string;
}


export interface GradebookMatrix {
  categories: Category[];
  grades: Grade[];
  pupil_tags: PupilTag[];
}
