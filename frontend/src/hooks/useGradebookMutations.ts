import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAuth } from "@/utils/fetchAuth";
import { Grade, Category, GradebookMatrix } from "@/types";
import { toast } from "sonner";
import { useCallback, useEffect, useRef } from "react";

type GradeUpdateInput = Pick<Grade, "category_id" | "pupil_id" | "assessment_name"> & Partial<Grade>;

interface GradeMutationContext {
  previousGrade: Grade | undefined;
  optimisticGrade: Grade;
}

function isSameCell(a: Pick<Grade, "category_id" | "pupil_id" | "assessment_name">, b: Pick<Grade, "category_id" | "pupil_id" | "assessment_name">) {
  return Number(a.category_id) === Number(b.category_id)
    && Number(a.pupil_id) === Number(b.pupil_id)
    && a.assessment_name === b.assessment_name;
}

function upsertGrade(grades: Grade[], nextGrade: Grade): Grade[] {
  const filtered = grades.filter((g) => !isSameCell(g, nextGrade));
  return [...filtered, nextGrade];
}

export function useGradebookMutations(subjectId: number | null) {
  const queryClient = useQueryClient();
  const invalidationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleMatrixInvalidation = useCallback(() => {
    if (invalidationTimerRef.current) clearTimeout(invalidationTimerRef.current);
    invalidationTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["matrix", subjectId] });
      invalidationTimerRef.current = null;
    }, 400);
  }, [queryClient, subjectId]);

  useEffect(() => () => {
    if (invalidationTimerRef.current) clearTimeout(invalidationTimerRef.current);
  }, []);

  const updateGrade = useMutation({
    mutationFn: async (grade: GradeUpdateInput) => {
      const { data } = await fetchAuth("/api/gradebook/grade", {
        method: "POST",
        body: JSON.stringify(grade),
      });
      return data;
    },
    onMutate: async (newGrade): Promise<GradeMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ["matrix", subjectId] });
      const previousMatrix = queryClient.getQueryData<GradebookMatrix>(["matrix", subjectId]);
      const previousGrade = previousMatrix?.grades.find((g) => isSameCell(g, newGrade));
      const optimisticGrade: Grade = {
        category_id: newGrade.category_id,
        pupil_id: newGrade.pupil_id,
        assessment_name: newGrade.assessment_name,
        grade_value: newGrade.grade_value ?? previousGrade?.grade_value ?? null,
        is_visible: newGrade.is_visible ?? previousGrade?.is_visible ?? true,
      };

      if (previousMatrix) {
        queryClient.setQueryData<GradebookMatrix>(["matrix", subjectId], {
          ...previousMatrix,
          grades: upsertGrade(previousMatrix.grades, optimisticGrade),
        });
      }

      return { previousGrade, optimisticGrade };
    },
    onError: (err, newGrade, context) => {
      queryClient.setQueryData<GradebookMatrix | undefined>(["matrix", subjectId], (current) => {
        if (!current || !context) return current;
        const activeGrade = current.grades.find((g) => isSameCell(g, context.optimisticGrade));
        const stillMatchesOptimistic =
          !!activeGrade
          && activeGrade.grade_value === context.optimisticGrade.grade_value
          && activeGrade.is_visible === context.optimisticGrade.is_visible;
        if (!stillMatchesOptimistic) return current;
        if (!context.previousGrade) {
          return {
            ...current,
            grades: current.grades.filter((g) => !isSameCell(g, context.optimisticGrade)),
          };
        }
        return {
          ...current,
          grades: upsertGrade(current.grades, context.previousGrade),
        };
      });
      toast.error("Note konnte nicht gespeichert werden", {
        description: err instanceof Error ? err.message : "Bitte Verbindung prüfen und erneut versuchen.",
      });
      scheduleMatrixInvalidation();
    },
    onSuccess: (data, newGrade) => {
      if (!data) {
        scheduleMatrixInvalidation();
        return;
      }
      queryClient.setQueryData<GradebookMatrix | undefined>(["matrix", subjectId], (current) => {
        if (!current) return current;
        const serverGrade = (data.grade ?? data) as Partial<Grade>;
        const mergedGrade: Grade = {
          category_id: newGrade.category_id,
          pupil_id: newGrade.pupil_id,
          assessment_name: newGrade.assessment_name,
          grade_value: serverGrade.grade_value ?? newGrade.grade_value ?? null,
          is_visible: serverGrade.is_visible ?? newGrade.is_visible ?? true,
          id: serverGrade.id,
          created_at: serverGrade.created_at,
        };
        return {
          ...current,
          grades: upsertGrade(current.grades, mergedGrade),
        };
      });
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
      scheduleMatrixInvalidation();
    },
    onError: (err) => {
      toast.error("Gewichtungen konnten nicht gespeichert werden", {
        description: err instanceof Error ? err.message : "Bitte erneut versuchen.",
      });
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
      scheduleMatrixInvalidation();
      toast.success("Kategorie erstellt");
    },
    onError: (err) => {
      toast.error("Kategorie konnte nicht erstellt werden", {
        description: err instanceof Error ? err.message : "Bitte Eingaben prüfen und erneut versuchen.",
      });
    }
  });

  const updateTag = useMutation({
    mutationFn: async (input: { pupil_id: number; tier_tag: string | null }) => {
      await fetchAuth("/api/gradebook/tag", {
        method: "POST",
        body: JSON.stringify({ ...input, subject_id: subjectId }),
      });
    },
    onMutate: async (newTag) => {
      await queryClient.cancelQueries({ queryKey: ["matrix", subjectId] });
      const previousMatrix = queryClient.getQueryData<GradebookMatrix>(["matrix", subjectId]);

      if (previousMatrix) {
        const nextTags = previousMatrix.pupil_tags.filter(t => t.pupil_id !== newTag.pupil_id);
        if (newTag.tier_tag) {
          nextTags.push({
            id: Date.now(), // temporary
            pupil_id: newTag.pupil_id,
            subject_id: Number(subjectId),
            tier_tag: newTag.tier_tag
          });
        }
        queryClient.setQueryData<GradebookMatrix>(["matrix", subjectId], {
          ...previousMatrix,
          pupil_tags: nextTags
        });
      }

      return { previousMatrix };
    },
    onError: (err, newTag, context) => {
      if (context?.previousMatrix) {
        queryClient.setQueryData(["matrix", subjectId], context.previousMatrix);
      }
      toast.error("Rang konnte nicht gespeichert werden");
    },
    onSettled: () => {
      scheduleMatrixInvalidation();
    },
  });

  const updateCategory = useMutation({
    mutationFn: async (category: Category) => {
      // Since the backend uses a batch update for categories on the subject route,
      // we need to fetch the current categories and swap the one being edited.
      const previousMatrix = queryClient.getQueryData<GradebookMatrix>(["matrix", subjectId]);
      if (!previousMatrix) return;

      const nextCategories = previousMatrix.categories.map(c => 
        Number(c.id) === Number(category.id) ? category : c
      );

      await fetchAuth(`/api/gradebook/subjects/${subjectId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          categories: nextCategories 
        }),
      });
    },
    onSuccess: () => {
      scheduleMatrixInvalidation();
      toast.success("Kategorie aktualisiert");
    },
    onError: (err) => {
      toast.error("Kategorie konnte nicht aktualisiert werden");
    }
  });

  const updateAssessment = useMutation({
    mutationFn: async (input: { category_id: number; old_name: string; name: string; info_text: string | null; deadline: string | null }) => {
      const { data } = await fetchAuth("/api/assessments/0", {
        method: "PUT",
        body: JSON.stringify(input),
      });
      return data;
    },
    onSuccess: () => {
      scheduleMatrixInvalidation();
      toast.success("Bewertung aktualisiert");
    },
    onError: (err) => {
      toast.error("Bewertung konnte nicht aktualisiert werden");
    }
  });

  return {
    updateGrade,
    updateWeights,
    createCategory,
    updateTag,
    updateCategory,
    updateAssessment,
  };
}
