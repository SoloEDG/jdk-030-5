<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { Dir } from "@/shared/types";
import type { PuncheryApi } from "../model/usePunchery";
import type { PunchRow } from "../types";
import { dirGlyph } from "../lib/program";

const props = defineProps<{ api: PuncheryApi }>();
const p = reactive(props.api);
const selectedPart = ref<"row" | "lit" | "dark">("row");

const dirs: Dir[] = ["n", "e", "s", "w"];

const selectedRow = computed<PunchRow | null>(() => {
  const id = p.selectedRowId;
  if (!id) return null;
  for (const segment of p.program.segments) {
    const found = segment.rows.find((row) => row.id === id);
    if (found) return found;
  }
  return null;
});

const diagnostics = computed(() =>
  p.verification.reports.map((report) => ({
    report,
    occurrences: report.events.filter((event) => event.rowId === p.selectedRowId),
  })),
);

function tapeLabel(id: string): string {
  return p.program.segments.find((segment) => segment.id === id)?.label ?? id;
}

function chainText(chain: { tapeId: string; ordinal: number }[]): string {
  if (chain.length === 0) return "主筒";
  return ["主筒", ...chain.map((stamp) => `${tapeLabel(stamp.tapeId)}#${stamp.ordinal}`)].join(" → ");
}

function rowState(rowId: string): string {
  const events = p.verification.reports.flatMap((report) =>
    report.events.filter((event) => event.rowId === rowId),
  );
  const blame = p.verification.reports.some((report) => report.failureRowId === rowId);
  if (blame) return "blame";
  if (events.some((event) => event.blocked)) return "blocked";
  if (events.some((event) => event.delivered)) return "delivers";
  if (events.length) return "used";
  return "unused";
}

function setDir(rowId: string, dir: Dir): void {
  p.mutateRow(rowId, (row) => {
    if (row.type === "dir") row.dir = dir;
  });
}

function setCall(rowId: string, tapeId: string): void {
  p.mutateRow(rowId, (row) => {
    if (row.type === "call") row.tapeId = tapeId;
  });
}

function setBranchDir(rowId: string, armName: "lit" | "dark", dir: Dir): void {
  p.mutateRow(rowId, (row) => {
    if (row.type === "branch" && row[armName].type === "dir") {
      row[armName].dir = dir;
    }
  });
}

function setBranchCall(rowId: string, armName: "lit" | "dark", tapeId: string): void {
  p.mutateRow(rowId, (row) => {
    if (row.type === "branch") row[armName] = { type: "call", tapeId };
  });
}

function chooseHole(rowId: string, part: "row" | "lit" | "dark" = "row"): void {
  selectedPart.value = part;
  p.selectHole(rowId);
}

function inspectHole(rowId: string, part: "row" | "lit" | "dark" = "row"): void {
  selectedPart.value = part;
  p.selectedRowId = rowId;
}

function pickDirHole(rowId: string, dir: Dir): void {
  setDir(rowId, dir);
  inspectHole(rowId);
}

function pickCallHole(rowId: string, tapeId: string): void {
  setCall(rowId, tapeId);
  inspectHole(rowId);
}

function pickBranchDir(rowId: string, armName: "lit" | "dark", dir: Dir): void {
  setBranchDir(rowId, armName, dir);
  inspectHole(rowId, armName);
}

function pickBranchCall(rowId: string, armName: "lit" | "dark", tapeId: string): void {
  setBranchCall(rowId, armName, tapeId);
  inspectHole(rowId, armName);
}

function when(stamp: number): string {
  return new Date(stamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
</script>

<template>
  <section class="punch-console panel" aria-label="穿孔搬运琴">
    <div class="punch-head">
      <div>
        <h2>穿孔搬运琴</h2>
        <p class="punch-sub">{{ p.roster.subtitle }}</p>
      </div>
      <div class="roster-tabs" role="tablist" aria-label="派工目录">
        <button
          v-for="item in p.rosters"
          :key="item.id"
          type="button"
          :class="{ current: item.id === p.rosterId }"
          @click="p.selectRoster(item.id)"
        >
          {{ item.title }}
        </button>
      </div>
    </div>

    <p class="punch-notice" :data-busy="p.busy">{{ p.notice }}</p>
    <p v-if="p.progressText" class="progress-text">{{ p.progressText }}</p>

    <div class="dispatch-bar">
      <div class="slot-buttons">
        <button
          v-for="slot in p.roster.slots"
          :key="slot.id"
          type="button"
          :class="['slot', { current: slot.id === p.slotId }]"
          @click="p.selectSlot(slot.id)"
        >
          {{ slot.label }}
        </button>
      </div>
      <p class="slot-cue">{{ p.selectedSlot.cue }}</p>
    </div>

    <div class="meter-grid" aria-label="步数牌">
      <div class="meter paper">
        <span>纸排</span>
        <b>{{ p.live.reads }}</b>
        <small>本谱 {{ p.verification.totalRows }} 排 / 限 {{ p.roster.limits.maxTotalRows }}</small>
      </div>
      <div class="meter move">
        <span>实际搬步</span>
        <b>{{ p.live.moves }}</b>
        <small>推箱 {{ p.live.pushes }} 次</small>
      </div>
      <div class="meter block">
        <span>被挡指令</span>
        <b>{{ p.live.blocks }}</b>
        <small>不记搬步，仍留 trace</small>
      </div>
      <div class="meter position">
        <span>读孔位置</span>
        <b class="pos">{{ p.live.position }}</b>
        <small>限额 {{ p.roster.limits.maxReads }} 纸排</small>
      </div>
    </div>

    <div class="play-bar">
      <button type="button" class="primary" :disabled="p.busy" @click="p.stepOnce">逐排下一读</button>
      <button type="button" :disabled="p.busy" @click="p.togglePlay">
        {{ p.playing ? "暂停" : "自动奏筒" }}
      </button>
      <button type="button" :class="{ armed: p.takeover }" :disabled="p.busy" @click="p.armTakeover">
        手卷接管方向键
      </button>
      <button type="button" :disabled="p.busy" @click="p.returnTapePosition">交还原排位</button>
      <button type="button" @click="p.resetSession()">重置该货位</button>
      <label class="sound-toggle">
        <input type="checkbox" :checked="p.soundOn" @change="p.setSound(($event.target as HTMLInputElement).checked)" />
        听音
      </label>
    </div>
    <p v-if="p.takeover" class="takeover-hint">
      接管中：请按方向键 / WASD；方向键不会推进纸排。完成后点「交还原排位」。
    </p>

    <div class="rolls">
      <section
        v-for="segment in p.program.segments"
        :key="segment.id"
        class="roll"
        :class="segment.id === 'main' ? 'main-roll' : 'tape-roll'"
      >
        <header>
          <h3>{{ segment.label }}</h3>
          <span>{{ segment.rows.length }} 排</span>
        </header>

        <ol class="hole-rows">
          <li
            v-for="(row, index) in segment.rows"
            :key="row.id"
            :class="['hole-row', row.type, rowState(row.id), { selected: p.selectedRowId === row.id }]"
          >
            <span class="row-no">{{ index + 1 }}</span>

            <div class="holes">
              <template v-if="row.type === 'dir'">
                <button
                  v-for="dir in dirs"
                  :key="dir"
                  type="button"
                  :class="['hole dir', { active: row.dir === dir }]"
                  :aria-label="`改为方向 ${dirGlyph(dir)}`"
                  @click="pickDirHole(row.id, dir)"
                >
                  {{ dirGlyph(dir) }}
                </button>
              </template>

              <template v-else-if="row.type === 'call'">
                <button
                  v-for="tape in p.program.segments.filter((item) => item.id !== 'main')"
                  :key="tape.id"
                  type="button"
                  :class="['hole call', { active: row.tapeId === tape.id }]"
                  @click="pickCallHole(row.id, tape.id)"
                >
                  借{{ tape.label }}
                </button>
              </template>

              <template v-else>
                <div class="branch-arm lit">
                  <em>明</em>
                  <button
                    v-for="dir in dirs"
                    :key="`lit-${dir}`"
                    type="button"
                    :class="['hole mini', { active: row.lit.type === 'dir' && row.lit.dir === dir }]"
                    @click="pickBranchDir(row.id, 'lit', dir)"
                  >
                    {{ dirGlyph(dir) }}
                  </button>
                  <button
                    type="button"
                    :class="['hole mini call', { active: row.lit.type === 'call' }]"
                    @click="pickBranchCall(row.id,'lit', 'tape-a')"
                  >
                    甲
                  </button>
                  <button
                    type="button"
                    :class="['hole mini call', { active: row.lit.type === 'call' && row.lit.tapeId === 'tape-b' }]"
                    @click="pickBranchCall(row.id,'lit', 'tape-b')"
                  >
                    乙
                  </button>
                </div>
                <div class="branch-arm dark">
                  <em>暗</em>
                  <button
                    v-for="dir in dirs"
                    :key="`dark-${dir}`"
                    type="button"
                    :class="['hole mini', { active: row.dark.type === 'dir' && row.dark.dir === dir }]"
                    @click="pickBranchDir(row.id, 'dark', dir)"
                  >
                    {{ dirGlyph(dir) }}
                  </button>
                  <button
                    type="button"
                    :class="['hole mini call', { active: row.dark.type === 'call' }]"
                    @click="pickBranchCall(row.id,'dark', 'tape-a')"
                  >
                    甲
                  </button>
                  <button
                    type="button"
                    :class="['hole mini call', { active: row.dark.type === 'call' && row.dark.tapeId === 'tape-b' }]"
                    @click="pickBranchCall(row.id,'dark', 'tape-b')"
                  >
                    乙
                  </button>
                </div>
              </template>
            </div>

            <button
              type="button"
              class="inspect-hole"
              :class="rowState(row.id)"
              @click="chooseHole(row.id)"
            >
              验孔
            </button>
            <div class="row-tools">
              <button type="button" aria-label="上移" @click="p.moveRow(segment.id, row.id, -1)">↑</button>
              <button type="button" aria-label="下移" @click="p.moveRow(segment.id, row.id, 1)">↓</button>
              <button type="button" aria-label="删除" @click="p.removeRow(segment.id, row.id)">×</button>
            </div>
          </li>
        </ol>

        <div class="add-row">
          <button v-for="dir in dirs" :key="`add-${dir}`" type="button" @click="p.addRow(segment.id, dir)">
            +{{ dirGlyph(dir) }}
          </button>
          <button type="button" @click="p.addRow(segment.id, 'branch')">+明暗岔</button>
          <button v-if="segment.id === 'main'" type="button" @click="p.addRow(segment.id, 'call-a')">+借甲</button>
          <button v-if="segment.id === 'main' || segment.id === 'tape-a'" type="button" @click="p.addRow(segment.id, 'call-b')">+借乙</button>
        </div>
      </section>
    </div>

    <div class="program-actions">
      <button type="button" class="primary" :disabled="p.busy" @click="p.optimizeAndArchive">
        {{ p.busy ? "验谱中…" : "查找最省纸方案并归档" }}
      </button>
      <button type="button" :disabled="p.busy" @click="p.loadOptimalSample">载入最短对孔</button>
      <button type="button" :disabled="p.busy" @click="p.loadNestedSample">载入嵌套借带样谱</button>
      <button type="button" :disabled="p.busy" @click="p.loadWrongMerge">载入错误合并案</button>
      <button type="button" :disabled="p.busy" @click="p.loadBadTape">载入借带失败案</button>
    </div>

    <ul v-if="p.verification.errors.length" class="validation-errors">
      <li v-for="error in p.verification.errors" :key="error">{{ error }}</li>
    </ul>

    <div class="dispatch-reports">
      <article v-for="report in p.verification.reports" :key="report.slotId" :class="['report', report.ok ? 'ok' : 'bad']">
        <h3>{{ report.slotLabel }}</h3>
        <p>
          <b>{{ report.ok ? "已交齐" : report.status === "invalid" ? "谱式无效" : "未交齐" }}</b>
          · 纸排 {{ report.reads }} · 搬步 {{ report.moves }} · 被挡 {{ report.blocks }}
        </p>
      </article>
    </div>

    <aside v-if="p.selectedRowId" class="hole-inspector">
      <div class="inspector-head">
        <h3>孔穴验尸</h3>
        <button type="button" @click="p.selectedRowId = null">关闭</button>
      </div>
      <p v-if="!selectedRow">这一排已被删除。</p>
      <div v-else>
        <p class="selected-description">
          <code>{{ selectedRow.type }}</code>
          <span v-if="selectedRow.type === 'dir'">方向 {{ dirGlyph(selectedRow.dir) }}</span>
          <span v-else-if="selectedRow.type === 'call'">调用 {{ tapeLabel(selectedRow.tapeId) }}</span>
          <span v-else>依据当前踏板明暗，选择明/暗孔位</span>
        </p>
        <div v-for="item in diagnostics" :key="item.report.slotId" class="diagnostic-slot">
          <h4 :class="item.report.ok ? 'ok' : 'bad'">{{ item.report.slotLabel }}</h4>
          <p v-if="item.occurrences.length === 0" class="muted">这只筒没有读到该孔（可能此前已交齐或谱式无效）。</p>
          <ul>
            <li v-for="event in item.occurrences" :key="event.seq" :class="{ blocked: event.blocked, delivered: event.delivered, blame: item.report.failureEventSeq === event.seq }">
              <span class="chain">{{ chainText(event.chain) }}</span>
              <span class="summary">{{ event.summary }}</span>
              <small>
                第 {{ event.readNo }} 纸排
                <template v-if="event.spawned"> · 引出 {{ tapeLabel(event.spawned.tapeId) }} 第 {{ event.spawned.ordinal }} 次</template>
                <template v-if="event.blocked"> · 被挡</template>
                <template v-if="item.report.failureEventSeq === event.seq"> · 当班失败归因排</template>
              </small>
            </li>
          </ul>
        </div>
      </div>
    </aside>

    <section class="catalog-box">
      <h3>关卡纸筒目录</h3>
      <p v-if="!p.savedPlan" class="muted">
        尚未归档经全部货位验奏的最省纸方案。单次最快推箱不会写入这里。
      </p>
      <article v-else class="saved-plan">
        <div class="saved-head">
          <b>{{ p.savedPlan.proof.totalRows }} 排最省纸方案</b>
          <button type="button" @click="p.loadSavedPlan">读回目录方案</button>
        </div>
        <span>{{ p.savedPlan.dispatchIds.length }} 种货位全验 · {{ when(p.savedPlan.verifiedAt) }}</span>
        <small>
          已排除 {{ p.savedPlan.proof.checkedBelowRows }} 排以下方案；有界全语法证明覆盖 {{ p.savedPlan.proof.exhaustivePrograms.toLocaleString() }} 个候选，当前方案已在浏览器逐货位复验。
          目录只按总排数替换，不按单次搬步速度替换。
        </small>
      </article>
    </section>
  </section>
</template>

<style scoped>
.punch-console { min-width: 0; width: min(980px, calc(100vw - 560px)); }
.punch-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.punch-sub { max-width: 560px; line-height: 1.5; }
.roster-tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.roster-tabs button, .play-bar button, .program-actions button, .slot-buttons button, .add-row button, .row-tools button, .inspector-head button {
  background: #1a140f; border: 1px solid var(--line); color: var(--paper); padding: 6px 9px; cursor: pointer;
}
.roster-tabs button.current, .slot-buttons button.current, button.primary { border-color: var(--brass); color: var(--brass); }
button:hover:not(:disabled) { border-color: var(--paper); }
button:disabled { opacity: .55; cursor: wait; }
.punch-notice { border-left: 3px solid var(--brass); padding: 8px 10px; background: #1a140f; line-height: 1.5; }
.punch-notice[data-busy="true"] { border-color: var(--moss); }
.progress-text { color: var(--moss); font-size: 13px; }
.dispatch-bar { margin: 10px 0; }
.slot-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.slot.current { background: rgba(201,163,106,.16); }
.slot-cue { font-size: 13px; opacity: .75; line-height: 1.5; }
.meter-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
.meter { border: 1px solid var(--line); background: #1a140f; padding: 10px; min-width: 0; }
.meter span { display: block; font-size: 12px; letter-spacing: .12em; opacity: .72; }
.meter b { display: block; font-size: 30px; line-height: 1.1; color: var(--brass); }
.meter b.pos { font-size: 16px; padding-top: 8px; }
.meter small { display: block; opacity: .62; font-size: 11px; line-height: 1.35; }
.meter.move b { color: var(--moss); }
.meter.block b { color: #d98b5f; }
.play-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 10px 0; }
.program-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 10px 0; }
.validation-errors { margin: 10px 0 0; padding: 9px 12px; list-style: none; border: 1px solid #c65f35; background: rgba(198,95,53,.13); color: #efad8d; }
.validation-errors li { line-height: 1.5; font-size: 13px; }
.play-bar button.armed { border-color: var(--rust); color: #e8b898; background: rgba(181,106,50,.16); }
.sound-toggle { font-size: 13px; display: flex; gap: 5px; align-items: center; }
.takeover-hint { color: #e8b898; border: 1px dashed var(--rust); padding: 7px 9px; }
.rolls { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 10px; align-items: start; }
.roll { border: 1px solid var(--line); background: #160f0a; padding: 9px; min-width: 0; }
.roll header { display: flex; justify-content: space-between; align-items: center; }
.roll h3 { margin: 0 0 6px; font-size: 13px; color: var(--brass); letter-spacing: .12em; }
.hole-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.hole-row { display: grid; grid-template-columns: 24px minmax(0,1fr) auto 58px; gap: 5px; align-items: center; padding: 5px; border: 1px solid transparent; background: rgba(255,255,255,.025); }
.hole-row.selected { border-color: var(--brass); }
.hole-row.blame { border-color: #c65f35; background: rgba(198,95,53,.13); }
.hole-row.blocked .hole.active { box-shadow: 0 0 0 1px #c65f35 inset; }
.hole-row.delivers { border-left: 2px solid var(--moss); }
.row-no { text-align: center; opacity: .55; font-size: 12px; }
.holes { display: flex; flex-wrap: wrap; gap: 3px; min-width: 0; }
.hole { width: 27px; height: 27px; padding: 0; border-radius: 50%; border: 1px solid #6b563c; background: #0d0a08; color: #8c785d; cursor: pointer; }
.hole.mini { width: 22px; height: 22px; font-size: 11px; }
.hole.active { background: radial-gradient(circle, var(--brass) 0 28%, #3a2a1c 31% 100%); color: #1c1610; border-color: var(--brass); font-weight: 700; }
.hole.call.active { background: var(--moss); border-color: var(--moss); }
.branch-arm { display: flex; align-items: center; gap: 2px; flex-basis: 100%; }
.branch-arm em { width: 18px; font-style: normal; font-size: 11px; opacity: .75; }
.branch-arm.lit em { color: #e3c66f; }
.branch-arm.dark em { color: #8fa7c2; }
.inspect-hole { font-size: 12px; padding: 4px 6px; }
.inspect-hole.blame { border-color: #c65f35; color: #efad8d; }
.inspect-hole.delivers { border-color: var(--moss); color: var(--moss); }
.row-tools { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; }
.row-tools button { padding: 2px 4px; font-size: 11px; }
.add-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.add-row button { font-size: 12px; padding: 4px 6px; }
.dispatch-reports { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; margin-top: 12px; }
.report { border: 1px solid var(--line); padding: 9px; background: #1a140f; }
.report h3 { margin: 0 0 4px; font-size: 14px; }
.report p { margin: 0; font-size: 13px; line-height: 1.5; }
.report.ok { border-color: rgba(125,155,106,.65); }
.report.ok b { color: var(--moss); }
.report.bad { border-color: rgba(198,95,53,.65); }
.report.bad b { color: #efad8d; }
.hole-inspector, .catalog-box { margin-top: 12px; border: 1px solid var(--brass); background: #17100b; padding: 12px; }
.inspector-head { display: flex; justify-content: space-between; align-items: center; }
.inspector-head h3, .catalog-box h3 { margin: 0 0 8px; color: var(--brass); letter-spacing: .14em; font-size: 14px; }
.selected-description { display: flex; gap: 8px; align-items: center; }
.diagnostic-slot { border-top: 1px solid var(--line); padding-top: 8px; margin-top: 8px; }
.diagnostic-slot h4 { margin: 0 0 5px; font-size: 13px; }
.diagnostic-slot h4.ok { color: var(--moss); }
.diagnostic-slot h4.bad { color: #efad8d; }
.diagnostic-slot ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.diagnostic-slot li { border-left: 2px solid var(--line); padding: 5px 8px; background: rgba(255,255,255,.025); }
.diagnostic-slot li.blocked { border-left-color: var(--rust); }
.diagnostic-slot li.delivered { border-left-color: var(--moss); }
.diagnostic-slot li.blame { background: rgba(198,95,53,.14); }
.chain { display: inline-block; min-width: 150px; color: var(--brass); font-size: 12px; }
.summary { font-size: 13px; }
.diagnostic-slot small { display: block; opacity: .65; margin-top: 2px; }
.muted { opacity: .62; font-size: 13px; line-height: 1.5; }
.saved-plan { display: grid; gap: 4px; }
.saved-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.saved-head button { background: #1a140f; border: 1px solid var(--line); color: var(--paper); padding: 5px 8px; cursor: pointer; }
.saved-plan b { color: var(--moss); font-size: 18px; }
.saved-plan span { font-size: 13px; }
.saved-plan small { opacity: .7; line-height: 1.5; }
@media (max-width: 1280px) {
  .punch-console { width: 100%; }
  .rolls { grid-template-columns: 1fr; }
  .meter-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
