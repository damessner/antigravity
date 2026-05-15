import { useQuery } from "@tanstack/react-query";
import { fetchAuth } from "@/utils/fetchAuth";
import { Subject, GradebookMatrix } from "@/types";

const EMPTY_ARRAY: any[] = [];

export function useGradebookData(classId: number | null) {
  const subjectsQuery = useQuery({
    queryKey: ["subjects", classId],
    queryFn: async () => {
      const { data } = await fetchAuth(`/api/gradebook/subjects?class_id=${classId}`);
      return data as Subject[];
    },
    enabled: !!classId,
  });

  return {
    subjects: subjectsQuery.data || EMPTY_ARRAY,
    isLoadingSubjects: subjectsQuery.isLoading,
    refetchSubjects: subjectsQuery.refetch,
  };
}


export function useGradebookMatrix(subjectId: number | null) {
  return useQuery<GradebookMatrix>({
    queryKey: ["matrix", subjectId],
    queryFn: async () => {
      const { data } = await fetchAuth(`/api/gradebook/matrix/${subjectId}`);
      return data as GradebookMatrix;
    },
    enabled: !!subjectId,
  });
}
