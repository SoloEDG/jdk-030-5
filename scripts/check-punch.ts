import { PUNCH_ROSTERS } from "../src/features/punchery/lib/rosters";
import { verifyProgram } from "../src/features/punchery/lib/simulate";
import { findMinimumPaper } from "../src/features/punchery/lib/optimize";

const roster = PUNCH_ROSTERS[0];

function check(name: string, program: ReturnType<typeof roster.defaultProgram>, expected: boolean) {
  const result = verifyProgram(program, roster);
  console.log(name, {
    expected,
    ok: result.ok,
    rows: result.totalRows,
    slots: result.reports.map((report) => ({
      id: report.slotId,
      ok: report.ok,
      status: report.status,
      reads: report.reads,
      moves: report.moves,
      blocks: report.blocks,
      failureRowId: report.failureRowId,
    })),
  });
  if (result.ok !== expected) throw new Error(`${name}: expected ${expected}, got ${result.ok}`);
}

check("optimal", roster.defaultProgram(), true);
check("nested", roster.nestedSample(), true);
check("wrong", roster.wrongMerge(), false);
check("badTape", roster.badTape(), false);

if (process.env.SKIP_OPT === "1") {
  console.log("SKIPPED OPTIMIZER; ALL FAST CHECKS PASSED");
  process.exit(0);
}

const started = Date.now();
const result = await findMinimumPaper(roster, (progress) => {
  if (progress.checked % 10000 === 0) console.log("progress", progress);
});
console.log("optimizer", {
  ms: Date.now() - started,
  rows: result.proof.totalRows,
  checked: result.proof.exhaustivePrograms,
  ok: result.verification.ok,
});
if (!result.verification.ok || result.proof.totalRows !== 5) process.exit(1);
console.log("ALL PUNCH CHECKS PASSED");
