import { evaluateGadgets } from "@/features/gadget/lib/power";
import { applyMove } from "@/features/hauler/lib/push";
import { freshAttempt } from "@/features/ledger/lib/steps";
import { goalsSatisfied } from "@/features/ledger/lib/win";
import type { Dir, GameDocument, TileKind } from "@/shared/types";
import type {
  DispatchReport,
  DispatchSlot,
  PunchLimits,
  PunchProgram,
  PunchRoster,
  TraceEvent,
} from "../types";
import { segmentOf, validateProgram } from "./program";

interface Frame {
  segmentId: string;
  rowIndex: number;
  ordinal: number;
}

export interface Runtime {
  slot: DispatchSlot;
  limits: PunchLimits;
  doc: GameDocument;
  frames: Frame[];
  reads: number;
  moves: number;
  blocks: number;
  pushes: number;
  seq: number;
  status: "running" | "delivered" | "quota" | "invalid";
  reason?: string;
  events: TraceEvent[];
  invocationCounts: Record<string, number>;
  validationErrors: string[];
}

function tilesOf(rows: string[]): TileKind[][] {
  return rows.map((row) =>
    [...row].map((ch) => {
      if (ch === "#") return "wall";
      if (ch === "*") return "goal";
      if (ch === "~") return "gap";
      return "floor";
    }),
  );
}

export function buildDispatchDocument(
  roster: PunchRoster,
  slot: DispatchSlot,
): GameDocument {
  const doc: GameDocument = {
    version: 1,
    currentLevelId: roster.id,
    attempt: freshAttempt(),
    records: {},
    level: {
      id: roster.id,
      title: roster.levelTitle,
      blurb: roster.blurb,
      width: roster.rows[0].length,
      height: roster.rows.length,
      tiles: tilesOf(roster.rows),
      player: { ...slot.player },
      boxes: slot.boxes.map((box, index) => ({
        ...box,
        id: `${slot.id}-box-${index}`,
      })),
      plates: roster.plates.map((plate, index) => ({
        ...plate,
        id: index === 0 ? roster.signalPlateId : `p-${roster.id}-${index}`,
        doorIds: [],
        floorIds: [],
        powered: false,
      })),
      doors: [],
      floors: [],
    },
  };
  evaluateGadgets(doc);
  return doc;
}

export function createRuntime(
  program: PunchProgram,
  roster: PunchRoster,
  slot: DispatchSlot,
  limits: PunchLimits = roster.limits,
  trustProgram = false,
): Runtime {
  const validation = trustProgram
    ? { ok: true, errors: [], totalRows: 0, tapeCount: 0, callEdges: {} }
    : validateProgram(program, {
        maxTapes: limits.maxTapes,
        maxTotalRows: limits.maxTotalRows,
        plateIds: roster.plates.map((_, index) =>
          index === 0 ? roster.signalPlateId : `p-${roster.id}-${index}`,
        ),
      });
  return {
    slot,
    limits,
    doc: buildDispatchDocument(roster, slot),
    frames: [{ segmentId: program.mainId, rowIndex: 0, ordinal: 0 }],
    reads: 0,
    moves: 0,
    blocks: 0,
    pushes: 0,
    seq: 0,
    status: validation.ok ? "running" : "invalid",
    reason: validation.errors[0],
    events: [],
    invocationCounts: {},
    validationErrors: validation.errors,
  };
}

function chainOf(rt: Runtime) {
  return rt.frames.slice(1).map((frame) => ({
    tapeId: frame.segmentId,
    ordinal: frame.ordinal,
  }));
}

function makeEvent(
  rt: Runtime,
  event: Omit<TraceEvent, "seq" | "dispatchId" | "moves" | "blocks">,
): TraceEvent {
  const full: TraceEvent = {
    seq: rt.seq + 1,
    dispatchId: rt.slot.id,
    moves: rt.moves,
    blocks: rt.blocks,
    ...event,
  };
  rt.seq = full.seq;
  rt.events.push(full);
  return full;
}

function applyDirection(
  rt: Runtime,
  dir: Dir,
  base: {
    rowId?: string;
    segmentId?: string;
    rowIndex?: number;
    chain: TraceEvent["chain"];
    plateId?: string;
    platePowered?: boolean;
    selectedArm?: "lit" | "dark";
  },
): TraceEvent {
  const result = applyMove(rt.doc, dir);
  let delivered = false;
  let error: string | undefined;
  if (result.moved) {
    rt.moves += 1;
    if (result.pushed) rt.pushes += 1;
    evaluateGadgets(rt.doc);
    if (goalsSatisfied(rt.doc)) {
      delivered = true;
      rt.status = "delivered";
      rt.doc.attempt.status = "cleared";
      rt.doc.attempt.steps = rt.moves;
    }
  } else {
    rt.blocks += 1;
    error = result.reason === "blocked" ? "被墙、箱子、门或踏板封住" : result.reason;
  }
  rt.doc.attempt.steps = rt.moves;
  return makeEvent(rt, {
    kind: "paper",
    readNo: rt.reads,
    summary: result.moved
      ? result.pushed
        ? `${dir}：推箱一格`
        : `${dir}：搬运手移动`
      : `${dir}：指令被挡`,
    dir,
    actualMove: result.moved,
    pushed: result.pushed,
    blocked: !result.moved,
    boxId: result.boxId,
    delivered,
    error,
    ...base,
  });
}

function invokeTape(
  program: PunchProgram,
  rt: Runtime,
  tapeId: string,
): { tapeId: string; ordinal: number } | undefined {
  const target = program.segments.find((segment) => segment.id === tapeId);
  if (!target || target.rows.length === 0) {
    rt.status = "invalid";
    rt.reason = `孔带 ${tapeId} 为空或不存在`;
    return undefined;
  }
  if (rt.frames.length >= rt.limits.maxDepth) {
    rt.status = "invalid";
    rt.reason = "借带嵌套超过深度限额";
    return undefined;
  }
  rt.invocationCounts[tapeId] = (rt.invocationCounts[tapeId] ?? 0) + 1;
  const stamp = { tapeId, ordinal: rt.invocationCounts[tapeId] };
  const frame = rt.frames[rt.frames.length - 1];
  frame.rowIndex += 1;
  rt.frames.push({ segmentId: tapeId, rowIndex: 0, ordinal: stamp.ordinal });
  return stamp;
}

export function stepRuntime(program: PunchProgram, rt: Runtime): TraceEvent | null {
  if (rt.status !== "running") return null;
  if (rt.validationErrors.length) {
    rt.status = "invalid";
    rt.reason = rt.validationErrors[0];
    return null;
  }
  if (rt.reads >= rt.limits.maxReads) {
    rt.status = "quota";
    rt.reason = "超过当班纸排动作限额";
    return null;
  }

  let frame = rt.frames[rt.frames.length - 1];
  let segment = segmentOf(program, frame.segmentId);
  let wrapped = false;

  if (frame.rowIndex >= segment.rows.length) {
    if (frame.segmentId === program.mainId) {
      frame.rowIndex = 0;
      wrapped = true;
    } else {
      rt.frames.pop();
      return makeEvent(rt, {
        kind: "system",
        readNo: rt.reads,
        chain: chainOf(rt),
        summary: `${segment.label}奏完，交还上一排位`,
        actualMove: false,
        pushed: false,
        blocked: false,
      });
    }
  }

  frame = rt.frames[rt.frames.length - 1];
  segment = segmentOf(program, frame.segmentId);
  const rowIndex = frame.rowIndex;
  const row = segment.rows[rowIndex];
  if (!row) {
    rt.status = "invalid";
    rt.reason = "纸排索引失效";
    return null;
  }

  rt.reads += 1;
  const common = {
    rowId: row.id,
    segmentId: segment.id,
    rowIndex,
    chain: chainOf(rt),
    wrapped,
  };

  if (row.type === "dir") {
    frame.rowIndex += 1;
    const event = applyDirection(rt, row.dir, common);
    if (rt.reads >= rt.limits.maxReads && rt.status === "running") {
      rt.status = "quota";
      rt.reason = "超过当班纸排动作限额";
    }
    return event;
  }

  if (row.type === "call") {
    const spawned = invokeTape(program, rt, row.tapeId);
    const event = makeEvent(rt, {
      ...common,
      kind: "paper",
      readNo: rt.reads,
      summary: `调用 ${row.tapeId}${spawned ? ` 第 ${spawned.ordinal} 次借带` : ""}`,
      spawned,
      actualMove: false,
      pushed: false,
      blocked: false,
      error: rt.reason,
    });
    if (rt.reads >= rt.limits.maxReads && rt.status === "running") {
      rt.status = "quota";
      rt.reason = "超过当班纸排动作限额";
    }
    return event;
  }

  const plate = rt.doc.level.plates.find((item) => item.id === row.plateId);
  const powered = plate?.powered ?? false;
  const arm = powered ? row.lit : row.dark;
  frame.rowIndex += 1;

  if (arm.type === "dir") {
    const event = applyDirection(rt, arm.dir, {
      ...common,
      plateId: row.plateId,
      platePowered: powered,
      selectedArm: powered ? "lit" : "dark",
    });
    if (rt.reads >= rt.limits.maxReads && rt.status === "running") {
      rt.status = "quota";
      rt.reason = "超过当班纸排动作限额";
    }
    return event;
  }

  const spawned = arm.type === "call" ? invokeTape(program, rt, arm.tapeId) : undefined;
  const event = makeEvent(rt, {
    ...common,
    kind: "paper",
    readNo: rt.reads,
    summary: `踏板${powered ? "明" : "暗"}，选择借 ${arm.tapeId}${spawned ? ` #${spawned.ordinal}` : ""}`,
    plateId: row.plateId,
    platePowered: powered,
    selectedArm: powered ? "lit" : "dark",
    spawned,
    actualMove: false,
    pushed: false,
    blocked: false,
    error: rt.reason,
  });
  if (rt.reads >= rt.limits.maxReads && rt.status === "running") {
    rt.status = "quota";
    rt.reason = "超过当班纸排动作限额";
  }
  return event;
}

export function manualMove(program: PunchProgram, rt: Runtime, dir: Dir): TraceEvent {
  const frame = rt.frames[rt.frames.length - 1];
  const segment = frame ? segmentOf(program, frame.segmentId) : undefined;
  const currentRow =
    frame && segment && frame.rowIndex < segment.rows.length
      ? segment.rows[frame.rowIndex]
      : undefined;
  const base = {
    segmentId: frame?.segmentId,
    rowIndex: frame?.rowIndex,
    rowId: currentRow?.id,
    chain: chainOf(rt),
  };
  const result = applyMove(rt.doc, dir);
  let delivered = false;
  if (result.moved) {
    rt.moves += 1;
    if (result.pushed) rt.pushes += 1;
    evaluateGadgets(rt.doc);
    if (goalsSatisfied(rt.doc)) {
      delivered = true;
      rt.status = "delivered";
      rt.doc.attempt.status = "cleared";
    }
  } else {
    rt.blocks += 1;
  }
  rt.doc.attempt.steps = rt.moves;
  return makeEvent(rt, {
    kind: "manual",
    readNo: rt.reads,
    summary: result.moved
      ? `手卷接管 ${dir}，纸带留在${segment?.label ?? "孔带"}第 ${(frame?.rowIndex ?? 0) + 1} 排`
      : `手卷方向 ${dir} 被挡，原排位不变`,
    dir,
    actualMove: result.moved,
    pushed: result.pushed,
    blocked: !result.moved,
    boxId: result.boxId,
    delivered,
    rowId: base.rowId,
    segmentId: base.segmentId,
    rowIndex: base.rowIndex,
    chain: base.chain,
  });
}

export function runDispatch(
  program: PunchProgram,
  roster: PunchRoster,
  slot: DispatchSlot,
  trustProgram = false,
): DispatchReport {
  const rt = createRuntime(program, roster, slot, roster.limits, trustProgram);
  let guard = 0;
  while (rt.status === "running" && guard < roster.limits.maxReads + 32) {
    const event = stepRuntime(program, rt);
    guard += 1;
    if (!event) break;
    if (event.delivered) break;
  }
  const lastPaper = [...rt.events].reverse().find((event) => event.kind === "paper");
  return {
    slotId: slot.id,
    slotLabel: slot.label,
    ok: rt.status === "delivered",
    status: rt.status === "running" ? "quota" : rt.status,
    reads: rt.reads,
    moves: rt.moves,
    blocks: rt.blocks,
    pushes: rt.pushes,
    events: rt.events,
    failureRowId: rt.status === "delivered" ? undefined : lastPaper?.rowId,
    failureEventSeq: rt.status === "delivered" ? undefined : lastPaper?.seq,
    doc: rt.doc,
  };
}

export function verifyProgram(
  program: PunchProgram,
  roster: PunchRoster,
): { ok: boolean; errors: string[]; reports: DispatchReport[]; totalRows: number } {
  const validation = validateProgram(program, {
    maxTapes: roster.limits.maxTapes,
    maxTotalRows: roster.limits.maxTotalRows,
    plateIds: [roster.signalPlateId],
  });
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      totalRows: validation.totalRows,
      reports: roster.slots.map((slot) => ({
        slotId: slot.id,
        slotLabel: slot.label,
        ok: false,
        status: "invalid" as const,
        reads: 0,
        moves: 0,
        blocks: 0,
        pushes: 0,
        events: [],
        doc: buildDispatchDocument(roster, slot),
      })),
    };
  }
  const reports = roster.slots.map((slot) => runDispatch(program, roster, slot));
  return {
    ok: reports.every((report) => report.ok),
    errors: [],
    reports,
    totalRows: validation.totalRows,
  };
}
