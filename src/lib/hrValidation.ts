export type HrValidationInput = {
  restingHr?: number | string | null;
  maxHr?: number | string | null;
  ltHr?: number | string | null;
  easyHrCap?: number | string | null;
};

export type HrValidationIssue = {
  field: "restingHr" | "maxHr" | "ltHr" | "easyHrCap" | "general";
  severity: "warning" | "error";
  message: string;
};

/**
 * Parses a heart rate input, removing "bpm" case-insensitively and converting to a valid integer.
 * Returns undefined for empty or invalid values.
 */
export function parseHrValue(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (s === "") return undefined;

  // Remove "bpm" case-insensitively
  const clean = s.replace(/bpm/gi, "").trim();
  if (clean === "") return undefined;

  const num = Number(clean);
  if (Number.isNaN(num) || !Number.isFinite(num) || num <= 0) return undefined;
  return Math.round(num);
}

/**
 * Validates a set of heart rate inputs (resting, max, LT, easy cap).
 * Checks ranges and cross-field constraints.
 */
export function validateHrValues(input: HrValidationInput): HrValidationIssue[] {
  const issues: HrValidationIssue[] = [];

  // 1. Parsing and syntax check
  const parseAndCheck = (
    val: number | string | null | undefined,
    field: "restingHr" | "maxHr" | "ltHr" | "easyHrCap",
    label: string
  ): number | undefined => {
    if (val === null || val === undefined || String(val).trim() === "") {
      return undefined;
    }
    const parsed = parseHrValue(val);
    if (parsed === undefined) {
      issues.push({
        field,
        severity: "error",
        message: `ค่า ${label} ไม่ถูกต้อง`,
      });
    }
    return parsed;
  };

  const restingHr = parseAndCheck(input.restingHr, "restingHr", "Resting HR");
  const maxHr = parseAndCheck(input.maxHr, "maxHr", "Max HR");
  const ltHr = parseAndCheck(input.ltHr, "ltHr", "LT HR");
  const easyHrCap = parseAndCheck(input.easyHrCap, "easyHrCap", "Easy HR cap");

  // 2. Range validation
  if (restingHr !== undefined) {
    if (restingHr < 30 || restingHr > 120) {
      issues.push({
        field: "restingHr",
        severity: "warning",
        message: "Resting HR ควรอยู่ประมาณ 30–120 bpm",
      });
    }
  }

  if (maxHr !== undefined) {
    if (maxHr < 120 || maxHr > 230) {
      issues.push({
        field: "maxHr",
        severity: "warning",
        message: "Max HR ควรอยู่ประมาณ 120–230 bpm",
      });
    }
  }

  if (ltHr !== undefined) {
    if (ltHr < 100 || ltHr > 210) {
      issues.push({
        field: "ltHr",
        severity: "warning",
        message: "LT HR ควรอยู่ประมาณ 100–210 bpm",
      });
    }
  }

  if (easyHrCap !== undefined) {
    if (easyHrCap < 90 || easyHrCap > 180) {
      issues.push({
        field: "easyHrCap",
        severity: "warning",
        message: "Easy HR cap ควรอยู่ประมาณ 90–180 bpm",
      });
    }
  }

  // 3. Cross-field validation (skip if any of the checked values are missing)
  if (restingHr !== undefined && easyHrCap !== undefined) {
    if (restingHr >= easyHrCap) {
      issues.push({
        field: "easyHrCap",
        severity: "error",
        message: "Easy HR cap ควรสูงกว่า Resting HR",
      });
    }
  }

  if (easyHrCap !== undefined && ltHr !== undefined) {
    if (easyHrCap >= ltHr) {
      issues.push({
        field: "easyHrCap",
        severity: "warning",
        message: "Easy HR cap สูงกว่า/เท่ากับ LT HR อาจทำให้โซน easy เพี้ยน",
      });
    }
  }

  if (ltHr !== undefined && maxHr !== undefined) {
    if (ltHr >= maxHr) {
      issues.push({
        field: "ltHr",
        severity: "error",
        message: "LT HR ควรต่ำกว่า Max HR",
      });
    }
  }

  if (restingHr !== undefined && maxHr !== undefined) {
    if (restingHr >= maxHr) {
      issues.push({
        field: "maxHr",
        severity: "error",
        message: "Max HR ควรสูงกว่า Resting HR",
      });
    }
  }

  return issues;
}

/**
 * Returns true if there are any issues with 'error' severity.
 */
export function hasBlockingHrErrors(input: HrValidationInput): boolean {
  const issues = validateHrValues(input);
  return issues.some((issue) => issue.severity === "error");
}
