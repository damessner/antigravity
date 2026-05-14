import { ScaleType, toPercent } from "./gradeUtils";

export interface ParsedDeltaItem {
  pupilId: number;
  pupilName: string;
  assessmentName: string;
  scaleType: string;
  oldValue: string;
  newValue: string;
  categoryId: number;
  isModified: boolean;
  validationWarning: string | null;
}

export interface ParseExcelResult {
  deltas: ParsedDeltaItem[];
  exportTimestamp: string | null;
  hasOptimisticLockWarning: boolean;
  lastMatrixUpdate: string | null;
}

/**
 * Validates and maps user input values entered inside offline spreadsheet cells
 * against designated evaluation scale continuum structures.
 */
export function validateScaleInput(valStr: string, scale: ScaleType): { cleanVal: string; warning: string | null } {
  const trimmed = valStr.trim();
  if (!trimmed) return { cleanVal: "", warning: null };

  if (scale === "numeric_1_5") {
    // Allows 1, 2, 3, 4, 5
    const num = Number(trimmed);
    if (!isNaN(num) && num >= 1 && num <= 5) {
      return { cleanVal: String(Math.round(num)), warning: null };
    }
    return { cleanVal: trimmed, warning: `Ungültige Eingabe '${trimmed}' für das Schulnoten-System (Erwartet: 1-5)` };
  }

  if (scale === "gpa_4_0") {
    // Allows float values from 0.0 to 4.0
    const num = Number(trimmed.replace(",", "."));
    if (!isNaN(num) && num >= 0 && num <= 4.0) {
      return { cleanVal: String(num), warning: null };
    }
    return { cleanVal: trimmed, warning: `Ungültiger GPA-Wert '${trimmed}' (Erwartet: Dezimalzahl zwischen 0.0 und 4.0)` };
  }

  if (scale === "symbolic") {
    // Allows +, ~, -
    if (["+", "~", "-"].includes(trimmed)) {
      return { cleanVal: trimmed, warning: null };
    }
    // Auto translate common substitutes if entered by accident
    if (trimmed === "1" || trimmed.toLowerCase() === "plus") return { cleanVal: "+", warning: "Automatisch auf '+' korrigiert" };
    if (trimmed === "3" || trimmed.toLowerCase() === "ok") return { cleanVal: "~", warning: "Automatisch auf '~' korrigiert" };
    if (trimmed === "5" || trimmed.toLowerCase() === "minus") return { cleanVal: "-", warning: "Automatisch auf '-' korrigiert" };
    
    return { cleanVal: trimmed, warning: `Symbolisches Zeichen unerkannt ('${trimmed}'). Erlaubt sind ausschließlich: +, ~, -` };
  }

  return { cleanVal: trimmed, warning: null };
}

/**
 * Generiert ein strukturiertes Excel-kompatibles Export-Dokument (HTML-integriertes XLS Format 
 * für maximale native Style-Unterstützung wie Indigo/Slate-Header und abwechselnde Zebra-Zeilenfarben)
 */
export function generateExcel({
  subject,
  classPupils,
  categories,
  allColumns,
  grades,
}: {
  subject: any;
  classPupils: any[];
  categories: any[];
  allColumns: any[];
  grades: any[];
}) {
  const exportTimestamp = new Date().toISOString();

  // Create styling tags supporting native MS Excel spreadsheet formatting engine
  let htmlString = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <style>
        table { border-collapse: collapse; font-family: 'Segoe UI', Calibri, sans-serif; font-size: 11pt; }
        .meta-label { font-weight: bold; color: #94a3b8; background-color: #0f172a; padding: 6px; }
        .meta-val { font-weight: bold; color: #38bdf8; background-color: #0f172a; padding: 6px; }
        .cat-header { background-color: #1e1b4b; color: #ffffff; font-weight: bold; text-align: center; border: 1px solid #312e81; padding: 8px; }
        .col-header { background-color: #0f172a; color: #cbd5e1; font-weight: bold; text-align: center; border: 1px solid #334155; padding: 8px; }
        .pupil-id { color: #64748b; font-size: 9pt; text-align: center; }
        .pupil-name { font-weight: bold; color: #000000; }
        .cell-input { text-align: center; font-weight: bold; }
        .row-zebra { background-color: #f8fafc; }
        .row-normal { background-color: #ffffff; }
        .cell-projection { background-color: #e0e7ff; color: #3730a3; font-weight: bold; text-align: center; }
      </style>
    </head>
    <body>
      <table border="1">
  `;

  // Row 1: Subject info meta block
  htmlString += `
    <tr>
      <td class="meta-label">Fachbezeichnung:</td>
      <td class="meta-val" colspan="2">${subject?.name || "Fach"}</td>
      <td class="meta-label">Lehrer-ID:</td>
      <td class="meta-val" colspan="${Math.max(1, allColumns.length - 1)}">${subject?.teacher_id || "1"}</td>
    </tr>
  `;

  // Row 2: Active Weight distribution mappings
  const weightSummary = categories.map(c => `${c.name} (${c.weight_percentage}%)`).join(" | ");
  htmlString += `
    <tr>
      <td class="meta-label">Gewichtungen:</td>
      <td class="meta-val" colspan="${allColumns.length + 3}">${weightSummary}</td>
    </tr>
  `;

  // Row 3: Absolute Offline synchronization base timestamp ensuring Optimistic Lock tracking
  htmlString += `
    <tr>
      <td class="meta-label">Export-Zeitstempel:</td>
      <td class="meta-val" colspan="${allColumns.length + 3}">[TS_EXPORT:${exportTimestamp}]</td>
    </tr>
  `;

  // Row 4: Category grouping sub-headers
  htmlString += `<tr><td colspan="3" class="cat-header">Schüler-Identifikation</td>`;
  categories.forEach((cat) => {
    const subsetCount = allColumns.filter(c => c.category.id === cat.id).length;
    htmlString += `<td colspan="${subsetCount}" class="cat-header">${cat.name} [Summe: ${cat.weight_percentage}%]</td>`;
  });
  htmlString += `<td class="cat-header">Berechneter Schnitt</td></tr>`;

  // Row 5: Data Header Row mapped with Scale-Encoding tag suffixes
  htmlString += `
    <tr>
      <td class="col-header">Schüler_ID</td>
      <td class="col-header">Name</td>
      <td class="col-header">Klasse</td>
  `;
  allColumns.forEach((col) => {
    const scaleStr = col.category.scale_type || "numeric_1_5";
    htmlString += `<td class="col-header">${col.assessmentName} [${scaleStr}]</td>`;
  });
  htmlString += `<td class="col-header">Schnitt-Projektion</td></tr>`;

  // Data rows mapping individual pupils stably
  classPupils.forEach((p, rIdx) => {
    const rowClass = rIdx % 2 === 1 ? "row-zebra" : "row-normal";
    htmlString += `<tr class="${rowClass}">`;
    htmlString += `<td class="pupil-id">${p.id}</td>`;
    htmlString += `<td class="pupil-name">${p.name}</td>`;
    htmlString += `<td style="text-align: center;">${p.class_name || ""}</td>`;

    // Process cells
    let totalWeight = 0;
    let weightedPctSum = 0;

    allColumns.forEach((col) => {
      const gObj = grades.find(
        (g) =>
          Number(g.category_id) === Number(col.category.id) &&
          Number(g.pupil_id) === Number(p.id) &&
          g.assessment_name === col.assessmentName
      );
      const valStr = gObj?.grade_value !== null && gObj?.grade_value !== undefined ? String(gObj.grade_value) : "";
      htmlString += `<td class="cell-input">${valStr}</td>`;

      if (valStr) {
        const pct = toPercent(valStr, col.category.scale_type || "numeric_1_5");
        if (pct !== null) {
          const w = Number(col.category.weight_percentage) || 0;
          weightedPctSum += pct * w;
          totalWeight += w;
        }
      }
    });

    // Determine inline projection representation
    let projectionResult = "-";
    if (totalWeight > 0) {
      const finalPercentage = weightedPctSum / totalWeight;
      if (finalPercentage >= 0.87) projectionResult = "1";
      else if (finalPercentage >= 0.75) projectionResult = "2";
      else if (finalPercentage >= 0.60) projectionResult = "3";
      else if (finalPercentage >= 0.50) projectionResult = "4";
      else projectionResult = "5";
    }

    htmlString += `<td class="cell-projection">${projectionResult}</td></tr>`;
  });

  htmlString += `
      </table>
    </body>
    </html>
  `;

  // Trigger download via Blob mapping
  const blob = new Blob([htmlString], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Gradebook_Export_${subject?.abbreviation || "Matrix"}_${exportTimestamp.substring(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parses back uploaded Excel CSV or exported XLS table files, extracting embedded evaluation deltas
 * while verifying Offline concurrency boundaries via reactive Optimistic Lock checks.
 */
export function parseExcel(
  fileContent: string,
  currentCategories: any[],
  currentGrades: any[],
  classPupils: any[]
): ParseExcelResult {
  const deltas: ParsedDeltaItem[] = [];
  let exportTimestamp: string | null = null;

  // Clean strings from HTML tags if generated via custom XLS Table wrapper, or parse plain text lines
  let plainRows: string[] = [];
  
  if (fileContent.includes("<table") || fileContent.includes("<html")) {
    // Extract table rows using simple regex or DOM parsing
    const trMatches = fileContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
    if (trMatches) {
      plainRows = trMatches.map((tr) => {
        // Strip td/th to semicolon delimiters
        const cellMatches = tr.match(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi);
        if (!cellMatches) return "";
        return cellMatches
          .map((c) => c.replace(/<\/?(td|th)[^>]*>/gi, "").replace(/<[^>]+>/g, "").trim())
          .join(";");
      }).filter(r => r.length > 0);
    }
  } else {
    // Process standard CSV format lines directly
    plainRows = fileContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  }

  // Scan for embedded baseline timestamps
  plainRows.forEach((row) => {
    const tsMatch = row.match(/\[TS_EXPORT:([^\]]+)\]/);
    if (tsMatch) {
      exportTimestamp = tsMatch[1];
    }
  });

  // Determine the baseline maximum modification timestamp present in active local state array
  let lastMatrixUpdate: string | null = null;
  let maxTime = 0;
  currentGrades.forEach(g => {
    if (g.date) {
      const t = new Date(g.date).getTime();
      if (t > maxTime) {
        maxTime = t;
        lastMatrixUpdate = g.date;
      }
    }
  });

  // Determine if a live online commit occurred inside the database after the offline backup was drawn
  let hasOptimisticLockWarning = false;
  if (exportTimestamp && maxTime > 0) {
    if (maxTime > new Date(exportTimestamp).getTime() + 1000) { // allow 1s skew margin
      hasOptimisticLockWarning = true;
    }
  }

  // Locate the specific Data Header row containing scale-encoded bracket descriptors
  let headerRowIndex = -1;
  let parsedColMappings: { colIdx: number; assessmentName: string; scaleType: string; categoryId: number }[] = [];

  for (let i = 0; i < plainRows.length; i++) {
    const cells = plainRows[i].split(";");
    // Look for recognizable baseline headers
    if (cells.some(c => c.toLowerCase().includes("schüler_id") || c.toLowerCase().includes("schülerid"))) {
      headerRowIndex = i;
      // Extract mappings for subsequent cells starting from index 3
      for (let cIdx = 3; cIdx < cells.length; cIdx++) {
        const cellTxt = cells[cIdx].trim();
        const scaleMatch = cellTxt.match(/^(.*)\s+\[([^\]]+)\]$/);
        if (scaleMatch) {
          const assName = scaleMatch[1].trim();
          const scaleType = scaleMatch[2].trim();

          // Map back to corresponding Category based on scale type or name sequences
          const matchedCat = currentCategories.find(c => c.scale_type === scaleType) 
            || currentCategories[0];

          if (matchedCat) {
            parsedColMappings.push({
              colIdx: cIdx,
              assessmentName: assName,
              scaleType,
              categoryId: matchedCat.id
            });
          }
        }
      }
      break;
    }
  }

  if (headerRowIndex === -1 || parsedColMappings.length === 0) {
    throw new Error("Dateistruktur inkompatibel: Daten-Header mit hinterlegten Skalen-Tags [scaleType] fehlt.");
  }

  // Parse subsequent pupil value records
  for (let r = headerRowIndex + 1; r < plainRows.length; r++) {
    const cells = plainRows[r].split(";");
    if (cells.length < 3) continue;

    const pIdStr = cells[0]?.trim();
    const pId = Number(pIdStr);
    if (isNaN(pId) || pId <= 0) continue;

    const matchedPupil = classPupils.find(p => Number(p.id) === pId);
    if (!matchedPupil) continue;

    parsedColMappings.forEach((mapping) => {
      const rawEnteredVal = cells[mapping.colIdx]?.trim() || "";
      
      // Look up currently registered active matrix value
      const existingGradeRecord = currentGrades.find(
        g => Number(g.pupil_id) === pId && Number(g.category_id) === mapping.categoryId && g.assessment_name === mapping.assessmentName
      );
      const oldValStr = existingGradeRecord?.grade_value !== null && existingGradeRecord?.grade_value !== undefined 
        ? String(existingGradeRecord.grade_value) 
        : "";

      // Validate entered characters against strict scale boundary constraints
      const { cleanVal, warning } = validateScaleInput(rawEnteredVal, mapping.scaleType as ScaleType);

      // Register delta bundle if deviations exist or user explicitly entered evaluations
      if (cleanVal !== oldValStr || warning) {
        deltas.push({
          pupilId: pId,
          pupilName: matchedPupil.name,
          assessmentName: mapping.assessmentName,
          scaleType: mapping.scaleType,
          oldValue: oldValStr,
          newValue: cleanVal,
          categoryId: mapping.categoryId,
          isModified: cleanVal !== oldValStr,
          validationWarning: warning
        });
      }
    });
  }

  return {
    deltas,
    exportTimestamp,
    hasOptimisticLockWarning,
    lastMatrixUpdate
  };
}
