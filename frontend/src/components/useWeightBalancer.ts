import { useState, useCallback, useEffect } from "react";

export interface CategoryWeightItem {
  id: number;
  name: string;
  weight_percentage: number;
  isLocked?: boolean;
  scale_type?: string;
  is_self_directed?: boolean;
  column_metadata?: any[];
}

export function useWeightBalancer(initialCategories: CategoryWeightItem[], onSaveDebounced: (updated: CategoryWeightItem[]) => void) {
  const [categories, setCategories] = useState<CategoryWeightItem[]>(() => 
    initialCategories.map(c => ({ ...c, weight_percentage: Number(c.weight_percentage) || 0 }))
  );

  // Sync internal state when props change
  useEffect(() => {
    setCategories(initialCategories.map(c => ({ 
      ...c, 
      weight_percentage: Number(c.weight_percentage) || 0,
      isLocked: c.isLocked || false 
    })));
  }, [initialCategories]);

  // Toggle lock state
  const toggleLock = useCallback((id: number) => {
    setCategories(prev => prev.map(c => c.id === id ? { ...c, isLocked: !c.isLocked } : c));
  }, []);

  // Proportional weight distribution algorithm guaranteeing exact sum of 100
  const handleWeightChange = useCallback((targetId: number, rawVal: number) => {
    setCategories(prev => {
      const targetIdx = prev.findIndex(c => c.id === targetId);
      if (targetIdx === -1 || prev[targetIdx].isLocked) return prev;

      // Calculate locked sum
      const lockedSum = prev.reduce((sum, c) => sum + (c.isLocked && c.id !== targetId ? c.weight_percentage : 0), 0);
      
      // Target maximum allowable weight cannot exceed remaining free capacity
      const maxAllowable = Math.max(0, 100 - lockedSum);
      const clampedVal = Math.min(maxAllowable, Math.max(0, Math.round(rawVal)));

      const oldVal = prev[targetIdx].weight_percentage;
      const delta = clampedVal - oldVal;

      if (delta === 0) return prev;

      // Find unlocked others
      const unlockedOthers = prev.filter(c => !c.isLocked && c.id !== targetId);
      if (unlockedOthers.length === 0) {
        // Cannot distribute delta if all others are locked
        return prev;
      }

      const sumOthers = unlockedOthers.reduce((sum, c) => sum + c.weight_percentage, 0);

      // Create new weights array
      let updated = prev.map(c => {
        if (c.id === targetId) {
          return { ...c, weight_percentage: clampedVal };
        }
        if (c.isLocked) {
          return { ...c };
        }

        // Proportional distribution among unlocked others
        let newWeight = 0;
        if (sumOthers > 0) {
          const proportion = c.weight_percentage / sumOthers;
          newWeight = c.weight_percentage - delta * proportion;
        } else {
          // If all others were 0, distribute equally
          newWeight = -delta / unlockedOthers.length;
        }

        return { ...c, weight_percentage: Math.max(0, newWeight) };
      });

      // Ensure clean integer sum exactly equals 100 by fixing truncation/rounding discrepancies
      let runningSum = updated.reduce((sum, c) => sum + Math.round(c.weight_percentage), 0);
      let discrepancy = 100 - runningSum;

      // Final integer rounding pass
      updated = updated.map(c => ({ ...c, weight_percentage: Math.round(c.weight_percentage) }));

      // Absorb integer discrepancy into the largest available unlocked category if needed
      if (discrepancy !== 0) {
        const candidateOthers = updated.filter(c => !c.isLocked && c.id !== targetId);
        if (candidateOthers.length > 0) {
          // Sort descending to give delta to largest category
          candidateOthers.sort((a, b) => b.weight_percentage - a.weight_percentage);
          const absorbTargetId = candidateOthers[0].id;
          updated = updated.map(c => c.id === absorbTargetId ? { ...c, weight_percentage: Math.max(0, c.weight_percentage + discrepancy) } : c);
        } else {
          // Fallback to target slider itself
          updated = updated.map(c => c.id === targetId ? { ...c, weight_percentage: Math.max(0, c.weight_percentage + discrepancy) } : c);
        }
      }

      // Trigger external debounced callback
      onSaveDebounced(updated);

      return updated;
    });
  }, [onSaveDebounced]);

  return {
    categories,
    handleWeightChange,
    toggleLock
  };
}
