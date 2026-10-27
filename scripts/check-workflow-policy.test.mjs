import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintWorkflow, summarize } from './check-workflow-policy.mjs';

const workflow = (steps) => `jobs:\n  validate:\n    steps:\n${steps}\n`;

test('every committed workflow follows the run-through policy', () => {
  const dir = '.github/workflows';
  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    assert.deepEqual(lintWorkflow(readFileSync(join(dir, file), 'utf8'), file), []);
  }
});

test('passes setup steps without a condition and checks that run through', () => {
  const text = workflow(
    [
      '      - name: "Setup: install"',
      '        id: tools',
      '        run: npm install',
      '      - name: "Check: html"',
      "        if: ${{ !cancelled() && steps.tools.outcome == 'success' }}",
      '        run: html-validate "**/*.html"',
      '      - name: "Summary: failures"',
      '        if: ${{ !cancelled() }}',
      '        run: node summary.mjs',
    ].join('\n'),
  );
  assert.deepEqual(lintWorkflow(text), []);
});

test('ignores lists outside steps and comments between steps', () => {
  const text = [
    'on:',
    '  pull_request:',
    '    branches:',
    '      - main',
    'jobs:',
    '  validate:',
    '    steps:',
    '      - name: "Setup: install"',
    '        run: npm install',
    '      # a note about the next step',
    '      - name: "Check: html"',
    '        run: html-validate',
  ].join('\n');
  assert.deepEqual(lintWorkflow(text), ['workflow: step "Check: html" must start its condition with ${{ !cancelled() }}']);
});

test('fails a check step that lost its !cancelled() condition', () => {
  const text = workflow(['      - name: "Check: html"', '        run: html-validate "**/*.html"'].join('\n'));
  assert.match(lintWorkflow(text).join('\n'), /Check: html.*!cancelled/);
});

test('fails a check step whose condition skips after a failure', () => {
  const text = workflow(['      - name: "Check: html"', '        if: ${{ success() }}', '        run: x'].join('\n'));
  assert.equal(lintWorkflow(text).length, 1);
});

test('fails a check step that chains two checks with &&', () => {
  const text = workflow(['      - name: "Check: all"', '        if: ${{ !cancelled() }}', '        run: a && b'].join('\n'));
  assert.match(lintWorkflow(text).join('\n'), /chains commands/);
});

test('fails a step that is not classified as Setup, Check or Summary', () => {
  const text = workflow(['      - name: Tests', '        run: npm test'].join('\n'));
  assert.match(lintWorkflow(text).join('\n'), /must be named/);
});

test('summary names every failed or skipped check', () => {
  assert.deepEqual(summarize('a=success b=failure c= d=skipped'), ['b: failure', 'c: did not run', 'd: skipped']);
  assert.deepEqual(summarize('a=success b=success'), []);
});
