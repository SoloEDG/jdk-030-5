import { computed, onUnmounted, ref } from "vue";
import type { Dir, GameDocument } from "@/shared/types";
import {
  PUNCH_ROSTERS,
  getRoster,
} from "../lib/rosters";
import {
  createRuntime,
  manualMove,
  stepRuntime,
  verifyProgram,
  type Runtime,
} from "../lib/simulate";
import { findMinimumPaper } from "../lib/optimize";
import {
  fingerprintRoster,
  readPunchCatalog,
  upsertCertifiedPlan,
} from "../lib/punchCatalog";
import { playPunchSound, unlockAudio } from "../lib/audio";
import { makeBranchRow, makeCallRow, makeDirRow } from "../lib/program";
import type {
  CertifiedPlan,
  DispatchReport,
  PunchProgram,
  PunchRoster,
  TraceEvent,
} from "../types";

export interface LiveCounters {
  status: "running" | "delivered" | "quota" | "invalid";
  reads: number;
  moves: number;
  blocks: number;
  pushes: number;
  position: string;
}

export function usePunchery() {
  const rosters = PUNCH_ROSTERS;
  const rosterId = ref(PUNCH_ROSTERS[0].id);
  const roster = computed<PunchRoster>(() => getRoster(rosterId.value));
  const plans = ref<Record<string, CertifiedPlan>>(readPunchCatalog());
  const savedPlan = computed(() => plans.value[rosterId.value] ?? null);

  const initialPlan = plans.value[PUNCH_ROSTERS[0].id];
  const program = ref<PunchProgram>(
    initialPlan ? structuredClone(initialPlan.program) : PUNCH_ROSTERS[0].wrongMerge(),
  );
  const slotId = ref(roster.value.slots[0].id);
  const stage = ref<GameDocument>(
    createRuntime(program.value, roster.value, roster.value.slots[0]).doc,
  );
  const verification = ref<{ ok: boolean; errors: string[]; reports: DispatchReport[]; totalRows: number }>(
    verifyProgram(program.value, roster.value),
  );
  const events = ref<TraceEvent[]>([]);
  const selectedRowId = ref<string | null>(null);
  const playing = ref(false);
  const soundOn = ref(false);
  const takeover = ref(false);
  const busy = ref(false);
  const progressText = ref("");
  const notice = ref("红点孔可查看它在哪个货位、哪次借带中失败。");
  const live = ref<LiveCounters>({
    status: "running",
    reads: 0,
    moves: 0,
    blocks: 0,
    pushes: 0,
    position: "主筒 第 1 排",
  });

  let runtime: Runtime | null = null;
  let timer: number | null = null;

  const selectedSlot = computed(
    () => roster.value.slots.find((slot) => slot.id === slotId.value) ?? roster.value.slots[0],
  );

  function stopPlayback(): void {
    playing.value = false;
    if (timer != null) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function updatePosition(rt: Runtime): string {
    const frame = rt.frames[rt.frames.length - 1];
    if (!frame) return "已还筒";
    const segment = program.value.segments.find((item) => item.id === frame.segmentId);
    return `${segment?.label ?? frame.segmentId} 第 ${Math.min(frame.rowIndex + 1, segment?.rows.length ?? 1)} 排`;
  }

  function syncLive(rt: Runtime): void {
    live.value = {
      status: rt.status,
      reads: rt.reads,
      moves: rt.moves,
      blocks: rt.blocks,
      pushes: rt.pushes,
      position: updatePosition(rt),
    };
  }

  function resetSession(nextSlotId?: string): void {
    stopPlayback();
    if (nextSlotId) slotId.value = nextSlotId;
    const slot = roster.value.slots.find((item) => item.id === slotId.value) ?? roster.value.slots[0];
    runtime = createRuntime(program.value, roster.value, slot);
    stage.value = structuredClone(runtime.doc);
    events.value = [];
    takeover.value = false;
    syncLive(runtime);
  }

  function reverify(): void {
    verification.value = verifyProgram(program.value, roster.value);
  }

  function touchProgram(): void {
    reverify();
    resetSession();
  }

  function selectRoster(id: string): void {
    stopPlayback();
    rosterId.value = id;
    const plan = plans.value[id];
    program.value = plan
      ? structuredClone(plan.program)
      : getRoster(id).wrongMerge();
    slotId.value = getRoster(id).slots[0].id;
    selectedRowId.value = null;
    notice.value = plan
      ? "已载入关卡目录中经全部派工验奏的最省纸方案。"
      : "已载入易错合并谱；可点「查找最省纸方案」。";
    reverify();
    resetSession();
  }

  function selectSlot(id: string): void {
    resetSession(id);
  }

  function stepOnce(): void {
    if (busy.value) return;
    if (!runtime) resetSession();
    if (!runtime) return;
    if (runtime.status !== "running") {
      stopPlayback();
      return;
    }
    const event = stepRuntime(program.value, runtime);
    if (event) {
      events.value.push(event);
      if (soundOn.value) playPunchSound(event);
    }
    stage.value = structuredClone(runtime.doc);
    syncLive(runtime);
    if (runtime.status !== "running") stopPlayback();
  }

  function togglePlay(): void {
    if (busy.value) return;
    if (playing.value) {
      stopPlayback();
      return;
    }
    if (live.value.status !== "running") resetSession();
    playing.value = true;
    timer = window.setInterval(() => stepOnce(), 620);
  }

  function setSound(value: boolean): void {
    soundOn.value = value;
    if (value) unlockAudio();
  }

  function armTakeover(): void {
    stopPlayback();
    takeover.value = true;
    notice.value = "手卷已接管：方向键只推箱，不推进纸排；按「交还原排位」回到当前孔。";
  }

  function manualDir(dir: Dir): void {
    if (!takeover.value || busy.value) return;
    if (!runtime) resetSession();
    if (!runtime) return;
    if (runtime.status === "delivered") return;
    const event = manualMove(program.value, runtime, dir);
    events.value.push(event);
    if (soundOn.value) playPunchSound(event);
    stage.value = structuredClone(runtime.doc);
    syncLive(runtime);
  }

  function returnTapePosition(): void {
    takeover.value = false;
    const frame = runtime?.frames[runtime.frames.length - 1];
    if (frame) {
      const segment = program.value.segments.find((item) => item.id === frame.segmentId);
      const row = segment?.rows[frame.rowIndex];
      selectedRowId.value = row?.id ?? null;
    }
    notice.value = "已交还原排位；下一排仍从刚才的孔继续。";
  }

  function selectHole(rowId: string): void {
    selectedRowId.value = selectedRowId.value === rowId ? null : rowId;
  }

  function addRow(segmentId: string, type: "n" | "e" | "s" | "w" | "call-a" | "call-b" | "branch"): void {
    const segment = program.value.segments.find((item) => item.id === segmentId);
    if (!segment) return;
    if (type === "branch") segment.rows.push(makeBranchRow(roster.value.signalPlateId, { type: "dir", dir: "s" }, { type: "dir", dir: "n" }));
    else if (type === "call-a") segment.rows.push(makeCallRow("tape-a"));
    else if (type === "call-b") segment.rows.push(makeCallRow("tape-b"));
    else segment.rows.push(makeDirRow(type));
    touchProgram();
  }

  function removeRow(segmentId: string, rowId: string): void {
    const segment = program.value.segments.find((item) => item.id === segmentId);
    if (!segment) return;
    segment.rows = segment.rows.filter((row) => row.id !== rowId);
    if (selectedRowId.value === rowId) selectedRowId.value = null;
    touchProgram();
  }

  function moveRow(segmentId: string, rowId: string, delta: -1 | 1): void {
    const segment = program.value.segments.find((item) => item.id === segmentId);
    if (!segment) return;
    const index = segment.rows.findIndex((row) => row.id === rowId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= segment.rows.length) return;
    const [row] = segment.rows.splice(index, 1);
    segment.rows.splice(target, 0, row);
    touchProgram();
  }

  function mutateRow(rowId: string, mutate: (row: PunchProgram["segments"][number]["rows"][number]) => void): void {
    for (const segment of program.value.segments) {
      const row = segment.rows.find((item) => item.id === rowId);
      if (row) {
        mutate(row);
        break;
      }
    }
    touchProgram();
  }

  function loadProgram(factory: (roster: PunchRoster) => PunchProgram, message: string): void {
    stopPlayback();
    program.value = factory(roster.value);
    selectedRowId.value = null;
    notice.value = message;
    touchProgram();
  }

  function loadOptimalSample(): void {
    loadProgram((item) => item.defaultProgram(), "已载入最短对齐方案；正在全部派工验奏。");
  }

  function loadSavedPlan(): void {
    const plan = savedPlan.value;
    if (!plan) return;
    stopPlayback();
    program.value = structuredClone(plan.program);
    selectedRowId.value = null;
    notice.value = "已读回关卡目录中经全部货位验奏的最省纸方案。";
    touchProgram();
  }

  function loadWrongMerge(): void {
    loadProgram((item) => item.wrongMerge(), "已载入只按方向字串合并的错谱；点红孔看失败货位和借带次序。");
  }

  function loadBadTape(): void {
    loadProgram((item) => item.badTape(), "已载入重复借带失败案；点乙带南推孔，可看暗板货位从甲带第 2 次起被挡。");
  }

  function loadNestedSample(): void {
    loadProgram((item) => item.nestedSample(), "已载入主筒→甲带→乙带的嵌套样谱；可逐排看借带与还排位。");
  }

  async function optimizeAndArchive(): Promise<void> {
    if (busy.value) return;
    busy.value = true;
    progressText.value = "开始逐谱验孔";
    stopPlayback();
    try {
      const result = await findMinimumPaper(roster.value, (progress) => {
        progressText.value = `${progress.phase} · 已查 ${progress.checked.toLocaleString()} 谱`;
      }, { runExhaustive: false });
      program.value = result.program;
      verification.value = result.verification;
      resetSession();
      const plan: CertifiedPlan = {
        rosterId: roster.value.id,
        fingerprint: fingerprintRoster(roster.value),
        program: result.program,
        proof: result.proof,
        dispatchIds: roster.value.slots.map((slot) => slot.id),
        verifiedAt: Date.now(),
      };
      plans.value = upsertCertifiedPlan(plan);
      notice.value = `找到 ${result.proof.totalRows} 排最省纸方案，并已在 ${roster.value.slots.length} 种货位全部验奏后归档。`;
      progressText.value = `证明覆盖 ${result.proof.exhaustivePrograms.toLocaleString()} 个 ${result.proof.checkedBelowRows} 排以下候选，并已全货位复验`;
    } catch (error) {
      notice.value = error instanceof Error ? error.message : "寻谱失败";
      progressText.value = "";
    } finally {
      busy.value = false;
    }
  }

  onUnmounted(() => {
    stopPlayback();
  });

  resetSession();

  return {
    rosters,
    rosterId,
    roster,
    plans,
    savedPlan,
    program,
    slotId,
    selectedSlot,
    stage,
    verification,
    events,
    selectedRowId,
    playing,
    soundOn,
    takeover,
    busy,
    progressText,
    notice,
    live,
    selectRoster,
    selectSlot,
    resetSession,
    stopPlayback,
    stepOnce,
    togglePlay,
    setSound,
    armTakeover,
    manualDir,
    returnTapePosition,
    selectHole,
    addRow,
    removeRow,
    moveRow,
    mutateRow,
    loadOptimalSample,
    loadSavedPlan,
    loadWrongMerge,
    loadBadTape,
    loadNestedSample,
    optimizeAndArchive,
    reverify,
  };
}

export type PuncheryApi = ReturnType<typeof usePunchery>;
