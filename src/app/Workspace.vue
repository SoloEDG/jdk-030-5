<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { StageView, TileLegend } from "@/features/atlas";
import { GadgetPanel } from "@/features/gadget";
import { poweredSummary } from "@/features/gadget/lib/power";
import { MoverHud } from "@/features/hauler";
import { StepMeter } from "@/features/ledger";
import { PunchConsole, usePunchery } from "@/features/punchery";
import { LevelRail, RecordBoard } from "@/features/voyage";
import { dirFromKey } from "./keys";
import { useWorkshop } from "./useWorkshop";

const shop = useWorkshop();
const punch = usePunchery();
const punchRoster = punch.roster;
const mode = ref<"punch" | "manual">("punch");
const { document, notice } = shop;
const { title, blurb } = shop.atlas;
const { counts } = shop.hauler;
const { summary } = shop.gadget;
const { steps, status, coverage } = shop.ledger;
const { catalog, completed } = shop.voyage;

const stageDocument = computed(() =>
  mode.value === "punch" ? punch.stage.value : document.value,
);
const gadgetSummary = computed(() =>
  mode.value === "punch" ? poweredSummary(punch.stage.value) : summary.value,
);
const headerNotice = computed(() =>
  mode.value === "punch" ? punch.notice.value : notice.value.message,
);

function onRailSelect(id: string): void {
  switchMode("manual");
  shop.selectLevel(id);
}

function onRailReset(): void {
  if (mode.value === "punch") punch.resetSession();
  else shop.reset();
}

function switchMode(next: "punch" | "manual"): void {
  mode.value = next;
  punch.stopPlayback();
}

function onKey(event: KeyboardEvent): void {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("input, textarea, select")) return;
  if (event.code === "Space" && mode.value === "punch") {
    if (target instanceof HTMLElement && target.closest("button")) return;
    event.preventDefault();
    punch.stepOnce();
    return;
  }
  const action = dirFromKey(event);
  if (!action) return;
  event.preventDefault();
  if (action === "reset") {
    if (mode.value === "punch") punch.resetSession();
    else shop.reset();
    return;
  }
  if (mode.value === "punch") {
    if (punch.takeover.value) punch.manualDir(action);
    else punch.stepOnce();
    return;
  }
  shop.move(action);
}

onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="workshop">
    <header class="mast">
      <div class="brand">
        <span class="mark" aria-hidden="true">闩</span>
        <div>
          <h1>栈闩工房 · 穿孔搬运琴</h1>
          <p>箱认踏板，板动门廊；同一只纸筒，为几种起始货位验奏最省排打孔法。</p>
        </div>
      </div>
      <p class="notice" :data-tone="mode === 'punch' ? 'info' : notice.tone">{{ headerNotice }}</p>
    </header>

    <nav class="mode-tabs" aria-label="工作台切换">
      <button type="button" :class="{ current: mode === 'punch' }" @click="switchMode('punch')">
        穿孔搬运琴
      </button>
      <button type="button" :class="{ current: mode === 'manual' }" @click="switchMode('manual')">
        手动推箱台
      </button>
    </nav>

    <div class="bench">
      <aside class="rail">
        <LevelRail :catalog="catalog" @select="onRailSelect" @reset="onRailReset" />
        <RecordBoard :completed="completed" />
      </aside>
      <main class="stage">
        <div class="stage-head">
          <h2>{{ mode === "punch" ? punchRoster.levelTitle : title }}</h2>
          <p>{{ mode === "punch" ? punchRoster.blurb : blurb }}</p>
        </div>
        <StageView :document="stageDocument" />
        <MoverHud v-if="mode === 'manual'" :counts="counts" />
        <PunchConsole v-if="mode === 'punch'" :api="punch" />
      </main>
      <aside class="side">
        <StepMeter v-if="mode === 'manual'" :steps="steps" :status="status" :coverage="coverage" />
        <section v-else class="panel punch-side-note">
          <h2>验奏规则</h2>
          <ul>
            <li>一排只发一个方向、一次借带，或一个明暗岔孔。</li>
            <li>主筒奏完回头；货位交齐立刻停。</li>
            <li>借带可嵌套，递归谱直接判无效。</li>
            <li>纸排、实际搬步、被挡指令分牌计数。</li>
            <li>目录只保存全部货位验过的最省纸方案。</li>
          </ul>
        </section>
        <GadgetPanel :document="stageDocument" :summary="gadgetSummary" />
        <TileLegend />
      </aside>
    </div>
  </div>
</template>
