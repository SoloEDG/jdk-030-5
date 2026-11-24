import type { Dir } from "@/shared/types";
import type {
  Arm,
  ProgramValidation,
  PunchProgram,
  PunchRow,
} from "../types";

let sequence = 0;

export function punchId(prefix = "hole"): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

export function dirLabel(dir: Dir): string {
  return { n: "北 ↑", e: "东 →", s: "南 ↓", w: "西 ←" }[dir];
}

export function dirGlyph(dir: Dir): string {
  return { n: "↑", e: "→", s: "↓", w: "←" }[dir];
}

export function makeDirRow(dir: Dir): PunchRow {
  return { id: punchId("row"), type: "dir", dir };
}

export function makeCallRow(tapeId: string): PunchRow {
  return { id: punchId("row"), type: "call", tapeId };
}

export function makeBranchRow(
  plateId: string,
  lit: Arm,
  dark: Arm,
): PunchRow {
  return { id: punchId("row"), type: "branch", plateId, lit, dark };
}

export function dirArm(dir: Dir): Arm {
  return { type: "dir", dir };
}

export function callArm(tapeId: string): Arm {
  return { type: "call", tapeId };
}

export function createProgram(
  mainRows: PunchRow[] = [],
  tapes: { id: string; label: string; rows?: PunchRow[] }[] = [
    { id: "tape-a", label: "甲带", rows: [] },
    { id: "tape-b", label: "乙带", rows: [] },
  ],
): PunchProgram {
  return {
    mainId: "main",
    segments: [
      { id: "main", label: "主筒", rows: mainRows },
      ...tapes.map((tape) => ({
        id: tape.id,
        label: tape.label,
        rows: tape.rows ?? [],
      })),
    ],
  };
}

export function cloneProgram(program: PunchProgram): PunchProgram {
  return structuredClone(program);
}

export function segmentOf(program: PunchProgram, id: string) {
  const segment = program.segments.find((item) => item.id === id);
  if (!segment) throw new Error(`未知孔带 ${id}`);
  return segment;
}

export function rowTargetTapes(row: PunchRow): string[] {
  if (row.type === "call") return [row.tapeId];
  if (row.type === "branch") {
    return [row.lit, row.dark]
      .filter((arm): arm is Extract<Arm, { type: "call" }> => arm.type === "call")
      .map((arm) => arm.tapeId);
  }
  return [];
}

export function validateProgram(
  program: PunchProgram,
  options: { maxTapes: number; maxTotalRows: number; plateIds?: string[] },
): ProgramValidation {
  const errors: string[] = [];
  const main = program.segments.find((segment) => segment.id === program.mainId);
  if (!main) errors.push("缺少主纸筒");
  if (main && main.rows.length === 0) errors.push("主纸筒至少要有一排");

  const tapes = program.segments.filter((segment) => segment.id !== "main");
  if (tapes.length > options.maxTapes) {
    errors.push(`最多 ${options.maxTapes} 条孔带`);
  }
  const nonEmptyTapes = tapes.filter((tape) => tape.rows.length > 0);
  if (nonEmptyTapes.length > options.maxTapes) {
    errors.push(`启用的孔带超过 ${options.maxTapes} 条`);
  }

  const ids = new Set(program.segments.map((segment) => segment.id));
  const plateIds = new Set(options.plateIds ?? []);
  let totalRows = 0;
  const callEdges: Record<string, string[]> = {};

  for (const segment of program.segments) {
    totalRows += segment.rows.length;
    callEdges[segment.id] = [];
    for (const row of segment.rows) {
      for (const target of rowTargetTapes(row)) {
        callEdges[segment.id].push(target);
        if (!ids.has(target)) errors.push(`第 ${segment.label} 排引用了不存在的孔带`);
        if (target === "main") errors.push("孔带不能回借主筒，否则会破坏还排位");
      }
      if (row.type === "branch" && plateIds.size && !plateIds.has(row.plateId)) {
        errors.push("明暗岔引用了不存在的踏板");
      }
    }
  }

  if (totalRows > options.maxTotalRows) {
    errors.push(`总排数 ${totalRows} 超过纸筒限额 ${options.maxTotalRows}`);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  function detectCycle(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const target of callEdges[id] ?? []) {
      if (detectCycle(target)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  if (detectCycle(program.mainId)) errors.push("借带关系出现递归");

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    totalRows,
    tapeCount: nonEmptyTapes.length,
    callEdges,
  };
}

export function armLabel(arm: Arm): string {
  return arm.type === "dir" ? dirGlyph(arm.dir) : `借:${arm.tapeId}`;
}

export function rowSummary(row: PunchRow): string {
  if (row.type === "dir") return `方向 ${dirLabel(row.dir)}`;
  if (row.type === "call") return `借用 ${row.tapeId}`;
  return `明暗岔 明 ${armLabel(row.lit)} / 暗 ${armLabel(row.dark)}`;
}
