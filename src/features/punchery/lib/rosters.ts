import type { PunchRoster } from "../types";
import {
  callArm,
  makeBranchRow,
  makeCallRow,
  makeDirRow,
} from "./program";

const PLATE = "p-punch-ming-an-0";

export const PUNCH_ROSTERS: PunchRoster[] = [
  {
    id: "punch-ming-an",
    title: "明暗同筒",
    subtitle: "北货位踏板明亮，东错货位踏板暗；同一只筒要在第二排和第五排分别走对岔口。",
    levelTitle: "穿孔琴房·明暗岔",
    blurb: "同一段北行孔样，在明板货位是推箱，在暗板货位只是绕位。只按重复字串合并会在第二岔撞墙。",
    rows: [
      "#########",
      "#.......#",
      "#.......#",
      "#.......#",
      "#.......#",
      "#...*...#",
      "#########",
    ],
    player: { x: 5, y: 4 },
    boxes: [
      { kind: "timber", x: 1, y: 5 },
      { kind: "timber", x: 4, y: 3 },
    ],
    plates: [{ accept: "timber", x: 1, y: 1 }],
    signalPlateId: PLATE,
    goal: { x: 4, y: 5 },
    limits: {
      maxTapes: 2,
      maxTotalRows: 10,
      maxReads: 24,
      maxDepth: 4,
      certifyBelowRows: 5,
    },
    slots: [
      {
        id: "ming",
        label: "明板·北货位",
        cue: "信号箱压在左上木踏板上；人在货箱正北，两排南推交齐。",
        player: { x: 4, y: 2 },
        boxes: [
          { kind: "timber", x: 1, y: 1 },
          { kind: "timber", x: 4, y: 3 },
        ],
      },
      {
        id: "an",
        label: "暗板·东错货位",
        cue: "信号箱离开踏板；人在货箱东南，先绕到正北再推两次。",
        player: { x: 5, y: 4 },
        boxes: [
          { kind: "timber", x: 1, y: 5 },
          { kind: "timber", x: 4, y: 3 },
        ],
      },
      {
        id: "lang",
        label: "暗板·北廊货位",
        cue: "北孔被临时料箱挡两次；纸排不变，挡令计数但不换谱，西移后仍接同样两推。",
        player: { x: 5, y: 2 },
        boxes: [
          { kind: "timber", x: 1, y: 5 },
          { kind: "timber", x: 4, y: 3 },
          { kind: "timber", x: 5, y: 1 },
        ],
      },
    ],
    defaultProgram() {
      return {
        mainId: "main",
        segments: [
          {
            id: "main",
            label: "主筒",
            rows: [
              makeBranchRow(PLATE, { type: "dir", dir: "s" }, { type: "dir", dir: "n" }),
              makeBranchRow(PLATE, { type: "dir", dir: "s" }, { type: "dir", dir: "n" }),
              makeDirRow("w"),
              makeDirRow("s"),
              makeDirRow("s"),
            ],
          },
          { id: "tape-a", label: "甲带", rows: [] },
          { id: "tape-b", label: "乙带", rows: [] },
        ],
      };
    },
    wrongMerge() {
      return {
        mainId: "main",
        segments: [
          {
            id: "main",
            label: "主筒",
            rows: [
              makeDirRow("n"),
              makeDirRow("n"),
              makeDirRow("w"),
              makeDirRow("s"),
              makeDirRow("s"),
            ],
          },
          { id: "tape-a", label: "甲带", rows: [] },
          { id: "tape-b", label: "乙带", rows: [] },
        ],
      };
    },
    badTape() {
      return {
        mainId: "main",
        segments: [
          {
            id: "main",
            label: "主筒",
            rows: [makeCallRow("tape-a"), makeCallRow("tape-a")],
          },
          {
            id: "tape-a",
            label: "复借甲带",
            rows: [makeCallRow("tape-b")],
          },
          {
            id: "tape-b",
            label: "南推乙带",
            rows: [makeDirRow("s")],
          },
        ],
      };
    },
    nestedSample() {
      return {
        mainId: "main",
        segments: [
          {
            id: "main",
            label: "主筒",
            rows: [
              makeBranchRow(PLATE, { type: "dir", dir: "s" }, { type: "dir", dir: "n" }),
              makeBranchRow(PLATE, { type: "dir", dir: "s" }, { type: "dir", dir: "n" }),
              makeDirRow("w"),
              makeCallRow("tape-a"),
            ],
          },
          {
            id: "tape-a",
            label: "推交甲带",
            rows: [makeCallRow("tape-b"), makeCallRow("tape-b")],
          },
          {
            id: "tape-b",
            label: "南推乙带",
            rows: [makeDirRow("s")],
          },
        ],
      };
    },
  },
];

export function getRoster(id: string): PunchRoster {
  const roster = PUNCH_ROSTERS.find((item) => item.id === id);
  if (!roster) throw new Error(`未知派工筒 ${id}`);
  return roster;
}

export { callArm };
