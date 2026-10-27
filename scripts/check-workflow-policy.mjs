#!/usr/bin/env node
// Fleet CI rule: a gate job never stops at its first failing check.
//
// Every workflow step name starts with one of:
//   "Setup:"   checkout/install; may stay fail-fast
//   "Check:"   one verification; must carry `if: ${{ !cancelled() ... }}`
//              and must not chain commands with `&&`
//   "Summary:" the closing report; must carry `if: ${{ !cancelled() ... }}`
//
// Usage:
//   node scripts/check-workflow-policy.mjs [workflow.yml ...]   lint workflows
//   node scripts/check-workflow-policy.mjs --summary "a=success b=failure"

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RUN_THROUGH = /^\$\{\{\s*!cancelled\(\)/;

// Split the `steps:` lists of a workflow into step blocks. Line-based on
// purpose: the workflows here are hand-written and this avoids a YAML dependency.
export function parseSteps(text) {
  const lines = text.split('\n');
  const steps = [];
  let inSteps = false;
  let stepIndent = null;
  let current = null;
  for (const line of lines) {
    if (/^\s*steps:\s*$/.test(line)) {
      inSteps = true;
      stepIndent = null;
      current = null;
      continue;
    }
    if (!inSteps || line.trim() === '' || line.trim().startsWith('#')) continue;
    const indent = line.match(/^\s*/)[0].length;
    const item = line.match(/^(\s*)- (.*)$/);
    if (item && (stepIndent === null || indent === stepIndent)) {
      stepIndent = indent;
      current = { lines: [item[2]] };
      steps.push(current);
      continue;
    }
    if (stepIndent !== null && indent <= stepIndent) {
      inSteps = false;
      current = null;
      continue;
    }
    current?.lines.push(line.trim());
  }
  return steps.map(({ lines: body }) => {
    const field = (key) => {
      const hit = body.find((l) => l.startsWith(`${key}:`));
      return hit === undefined ? undefined : hit.slice(key.length + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
    };
    return { name: field('name'), if: field('if'), run: field('run'), body };
  });
}

export function lintWorkflow(text, file = 'workflow') {
  const problems = [];
  for (const step of parseSteps(text)) {
    const label = `${file}: step "${step.name ?? '(unnamed)'}"`;
    const kind = step.name?.match(/^(Setup|Check|Summary):/)?.[1];
    if (!kind) {
      problems.push(`${label} must be named "Setup: ...", "Check: ..." or "Summary: ..."`);
      continue;
    }
    if (kind === 'Setup') continue;
    if (!step.if || !RUN_THROUGH.test(step.if)) {
      problems.push(`${label} must start its condition with \${{ !cancelled() }}`);
    }
    if (kind === 'Check' && step.body.some((l) => l.includes('&&') && !l.startsWith('if:'))) {
      problems.push(`${label} chains commands with &&; give each check its own step`);
    }
  }
  return problems;
}

export function summarize(outcomes) {
  const failed = outcomes
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((pair) => pair.split('='))
    .filter(([, outcome]) => outcome !== 'success');
  return failed.map(([name, outcome]) => `${name}: ${outcome || 'did not run'}`);
}

function main(argv) {
  if (argv[0] === '--summary') {
    const failures = summarize(argv[1] ?? '');
    if (failures.length) {
      console.log(`${failures.length} check(s) failed:`);
      for (const f of failures) console.log(`  - ${f}`);
      return 1;
    }
    console.log('all checks passed');
    return 0;
  }
  const dir = '.github/workflows';
  const files = argv.length ? argv : readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => join(dir, f));
  const problems = files.flatMap((f) => lintWorkflow(readFileSync(f, 'utf8'), f));
  for (const p of problems) console.log(p);
  console.log(problems.length ? `${problems.length} policy problem(s)` : `${files.length} workflow(s) follow the run-through policy`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
