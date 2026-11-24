import type { BoxKind, Dir, GameDocument, Vec } from "@/shared/types";

export type Arm =
  | { type: "dir"; dir: Dir }
  | { type: "call"; tapeId: string };

export type PunchRow =
  | { id: string; type: "dir"; dir: Dir }
  | { id: string; type: "call"; tapeId: string }
  | {
      id: string;
      type: "branch";
      plateId: string;
      lit: Arm;
      dark: Arm;
    };

export interface PunchSegment {
  id: string;
  label: string;
  rows: PunchRow[];
}

export interface PunchProgram {
  mainId: string;
  segments: PunchSegment[];
}

export interface DispatchSlot {
  id: string;
  label: string;
  cue: string;
  player: Vec;
  boxes: { kind: BoxKind; x: number; y: number }[];
}

export interface PunchLimits {
  maxTapes: number;
  maxTotalRows: number;
  maxReads: number;
  maxDepth: number;
  certifyBelowRows: number;
}

export interface PunchRoster {
  id: string;
  title: string;
  subtitle: string;
  levelTitle: string;
  blurb: string;
  rows: string[];
  player: Vec;
  boxes: { kind: BoxKind; x: number; y: number }[];
  plates: { accept: BoxKind; x: number; y: number }[];
  signalPlateId: string;
  goal: Vec;
  limits: PunchLimits;
  slots: DispatchSlot[];
  defaultProgram: () => PunchProgram;
  wrongMerge: () => PunchProgram;
  badTape: () => PunchProgram;
  nestedSample: () => PunchProgram;
}

export interface CallStamp {
  tapeId: string;
  ordinal: number;
}

export interface TraceEvent {
  seq: number;
  kind: "paper" | "manual" | "system";
  dispatchId: string;
  readNo: number;
  rowId?: string;
  segmentId?: string;
  rowIndex?: number;
  chain: CallStamp[];
  spawned?: CallStamp;
  wrapped?: boolean;
  summary: string;
  dir?: Dir;
  plateId?: string;
  platePowered?: boolean;
  selectedArm?: "lit" | "dark";
  actualMove: boolean;
  pushed: boolean;
  blocked: boolean;
  boxId?: string;
  delivered?: boolean;
  error?: string;
  moves: number;
  blocks: number;
}

export type DispatchStatus = "running" | "delivered" | "quota" | "invalid";

export interface DispatchReport {
  slotId: string;
  slotLabel: string;
  ok: boolean;
  status: DispatchStatus;
  reads: number;
  moves: number;
  blocks: number;
  pushes: number;
  events: TraceEvent[];
  failureRowId?: string;
  failureEventSeq?: number;
  doc: GameDocument;
}

export interface ProgramValidation {
  ok: boolean;
  errors: string[];
  totalRows: number;
  tapeCount: number;
  callEdges: Record<string, string[]>;
}

export interface CertifiedProof {
  certifiedAt: number;
  totalRows: number;
  exhaustivePrograms: number;
  checkedBelowRows: number;
  engine: string;
}

export interface CertifiedPlan {
  rosterId: string;
  fingerprint: string;
  program: PunchProgram;
  proof: CertifiedProof;
  dispatchIds: string[];
  verifiedAt: number;
}
