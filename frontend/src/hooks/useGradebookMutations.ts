import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAuth } from "@/utils/fetchAuth";
import { Grade, Category } from "@/types";
import { toast } from "sonner";

export function useGradebookMutations(subjectId: number | null) {
  const queryClient = useQueryClient();

  const updateGrade = useMutation({
    mutationFn: async (grade: Partial<Grade>) => {
      const { data } = await fetchAuth("/api/gradebook/grade", {
        method: "POST",
        body: JSON.stringify(grade),
      });
      return data;
    },
    onMutate: async (newGrade) => {
      await queryClient.cancelQueries({ queryKey: ["matrix", subjectId] });
      const previousMatrix = queryClient.getQueryData<any>(["matrix", subjectId]);

      if (previousMatrix) {
        queryClient.setQueryData(["matrix", subjectId], {
          ...previousMatrix,
          grades: [
            ...previousMatrix.grades.filter((g: Grade) => 
              !(g.category_id === newGrade.category_id && g.pupil_id === newGrade.pupil_id && g.assessment_name === newGrade.assessment_name)
            ),
            { ...newGrade, is_visible: true }
          ]
        });
      }

      return { previousMatrix };
    },
    onError: (err, newGrade, context) => {
      if (context?.previousMatrix) {
        queryClient.setQueryData(["matrix", subjectId], context.previousMatrix);
      }
      toast.error("Note konnte nicht gespeichert werden");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["matrix", subjectId] });
    },
  });

  const updateWeights = useMutation({
    mutationFn: async (weights: { id: number; weight_percentage: number }[]) => {
      await fetchAuth("/api/gradebook/weights", {
        method: "PUT",
        body: JSON.stringify({ subject_id: subjectId, weights }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["matrix", subjectId] });
    },
  });

  const createCategory = useMutation({
    mutationFn: async (category: Partial<Category>) => {
      const { data } = await fetchAuth("/api/gradebook/category", {
        method: "POST",
        body: JSON.stringify({ ...category, subject_id: subjectId }),
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matrix", subjectId] });
      toast.success("Kategorie erstellt");
    },
  });

  return {
    updateGrade,
    updateWeights,
    createCategory,
  };
}
