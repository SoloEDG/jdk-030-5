import type { CertifiedPlan } from "../types";

const STORAGE_KEY = "jdk-030.punch-catalog.v1";

interface SaveFile {
  version: 1;
  plans: Record<string, CertifiedPlan>;
}

export function fingerprintRoster(roster: {
  id: string;
  rows: string[];
  slots: unknown;
  limits: unknown;
}): string {
  return JSON.stringify({
    id: roster.id,
    rows: roster.rows,
    slots: roster.slots,
    limits: roster.limits,
  });
}

export function readPunchCatalog(): Record<string, CertifiedPlan> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SaveFile;
    if (parsed.version !== 1 || !parsed.plans || typeof parsed.plans !== "object") {
      return {};
    }
    return parsed.plans;
  } catch {
    return {};
  }
}

export function writePunchCatalog(plans: Record<string, CertifiedPlan>): void {
  const save: SaveFile = { version: 1, plans };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

export function upsertCertifiedPlan(plan: CertifiedPlan): Record<string, CertifiedPlan> {
  const plans = readPunchCatalog();
  const current = plans[plan.rosterId];
  if (
    current &&
    current.fingerprint === plan.fingerprint &&
    current.program.segments.reduce((sum, segment) => sum + segment.rows.length, 0) <=
      plan.proof.totalRows
  ) {
    return plans;
  }
  plans[plan.rosterId] = plan;
  writePunchCatalog(plans);
  return plans;
}
