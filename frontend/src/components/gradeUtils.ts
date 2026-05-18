export type ScaleType =
  | "numeric_1_5"
  | "gpa_4_0"
  | "symbolic"
  | "numeric_0_100"
  | "percentage"
  | "letters_A_F";

export interface ColorSchemeGradient {
  type: 'gradient';
  best: string;
  worst: string;
}

export interface ColorSchemePerGrade {
  type: 'per_grade';
  grades: Record<string, string>;
}

export type ColorScheme = ColorSchemeGradient | ColorSchemePerGrade;

/**
 * Interpolates between two hex colors based on a 0.0–1.0 factor.
 * factor=1.0 returns colorA, factor=0.0 returns colorB.
 */
function interpolateHex(colorA: string, colorB: string, factor: number): string {
  const parse = (c: string) => {
    const hex = c.replace('#', '');
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(colorA);
  const [r2, g2, b2] = parse(colorB);
  const f = Math.max(0, Math.min(1, factor));
  const r = Math.round(r1 * f + r2 * (1 - f));
  const g = Math.round(g1 * f + g2 * (1 - f));
  const b = Math.round(b1 * f + b2 * (1 - f));
  return `rgb(${r},${g},${b})`;
}

/**
 * Returns a CSS color string for a grade cell based on the configured color scheme.
 * Returns null if no color should be applied.
 */
export function getGradeColor(
  valueStr: string | null | undefined,
  scale: ScaleType,
  colorScheme: ColorScheme | null | undefined
): string | null {
  if (!colorScheme || !valueStr || valueStr.trim() === '') return null;

  if (colorScheme.type === 'gradient') {
    const pct = toPercent(valueStr, scale);
    if (pct === null) return null;
    return interpolateHex(colorScheme.best, colorScheme.worst, pct);
  }

  if (colorScheme.type === 'per_grade') {
    const key = valueStr.trim();
    return colorScheme.grades[key] ?? null;
  }

  return null;
}

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
