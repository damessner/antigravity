import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAuth } from "@/utils/fetchAuth";
import { Subject, Category, Grade } from "@/types";

export function useGradebookData(classId: number | null) {
  const queryClient = useQueryClient();

  const subjectsQuery = useQuery({
    queryKey: ["subjects", classId],
    queryFn: async () => {
      const { data } = await fetchAuth(`/api/gradebook/subjects?class_id=${classId}`);
      return data as Subject[];
    },
    enabled: !!classId,
  });

  return {
    subjects: subjectsQuery.data || [],
    isLoadingSubjects: subjectsQuery.isLoading,
    refetchSubjects: subjectsQuery.refetch,
  };
}

export function useGradebookMatrix(subjectId: number | null) {
  return useQuery({
    queryKey: ["matrix", subjectId],
    queryFn: async () => {
      const { data } = await fetchAuth(`/api/gradebook/matrix/${subjectId}`);
      return data as { categories: Category[]; grades: Grade[]; pupil_tags: any[] };
    },
    enabled: !!subjectId,
  });
}
