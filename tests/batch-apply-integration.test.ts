import { expect, test } from "bun:test";

test("real saved selections reach acknowledged batches and truthful apply metadata", () => {
  const result = Bun.spawnSync([process.execPath, "run", "tests/fixtures/batch-apply-review.ts"], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toEqual({ exitCode: 0, stderr: "" });
});
