export type ScaleType =
  | "numeric_1_5"
  | "gpa_4_0"
  | "symbolic"
  | "numeric_0_100"
  | "percentage"
  | "letters_A_F";

/**
 * Universal Grade Normalization: Converts localized grade strings into standardized floats (0.0 to 1.0)
 */
export function toPercent(valStr: string | null | undefined, scale: ScaleType): number | null {
  if (valStr === null || valStr === undefined || valStr === "") return null;
  const trimmed = valStr.trim();
  if (trimmed === "") return null;

  if (scale === "symbolic") {

    if (trimmed === "+") return 1.0;
    if (trimmed === "~") return 0.5;
    if (trimmed === "-") return 0.0;
    return 0.5;
  }

  const num = Number(trimmed);
  if (isNaN(num)) return null;

  if (scale === "gpa_4_0") {
    // 4.0 = 1.0, 0.0 = 0.0
    return Math.max(0, Math.min(1, num / 4.0));
  }

  if (scale === "numeric_0_100" || scale === "percentage") {
    return Math.max(0, Math.min(1, num / 100));
  }

  if (scale === "letters_A_F") {
    const l = trimmed.toUpperCase();
    if (l === "A") return 1.0;
    if (l === "B") return 0.8;
    if (l === "C") return 0.6;
    if (l === "D") return 0.4;
    if (l === "E") return 0.2;
    if (l === "F") return 0.0;
    return null;
  }

  // numeric_1_5: 1 = Best/1.0, 5 = Worst/0.0
  const rawNorm = (num - 1) / 4.0;
  return Math.max(0, Math.min(1, 1 - rawNorm));
}

/**
 * Scale Switching Translation: Converts standardized floats (0.0 to 1.0) back to formatted string targets
 */
export function fromPercent(pct: number | null, scale: ScaleType): string {
  if (pct === null || isNaN(pct)) return "";

  const clamped = Math.max(0, Math.min(1, pct));

  if (scale === "symbolic") {

    if (clamped >= 0.75) return "+";
    if (clamped >= 0.25) return "~";
    return "-";
  }

  if (scale === "gpa_4_0") {
    return (clamped * 4.0).toFixed(1);
  }

  if (scale === "numeric_0_100" || scale === "percentage") {
    return String(Math.round(clamped * 100));
  }

  if (scale === "letters_A_F") {
    if (clamped >= 0.9) return "A";
    if (clamped >= 0.75) return "B";
    if (clamped >= 0.6) return "C";
    if (clamped >= 0.45) return "D";
    if (clamped >= 0.2) return "E";
    return "F";
  }

  // numeric_1_5: mapping back to classic 1-5 discrete AT integers
  const numericGrade = Math.round(1 + 4.0 * (1 - clamped));
  return String(Math.max(1, Math.min(5, numericGrade)));
}

/**
 * Helper to generate valid sample input placeholder guides based on ScaleType
 */
export function getPlaceholderForScale(scale: ScaleType): string {
  if (scale === "symbolic") return "+, ~, -";

  if (scale === "gpa_4_0") return "0.0 - 4.0";
  if (scale === "numeric_0_100") return "0 - 100";
  if (scale === "percentage") return "0 - 100%";
  if (scale === "letters_A_F") return "A - F";
  return "1 - 5";
}
