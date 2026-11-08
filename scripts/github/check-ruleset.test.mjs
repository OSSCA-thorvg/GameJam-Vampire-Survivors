import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { EXPECTED_CONTEXTS, checkRuleset, jobNames } from './check-ruleset.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const realRuleset = () => JSON.parse(read('.github/rulesets/main.json'));
const realNames = () => jobNames(read('.github/workflows/ci.yml'));

const WORKFLOW = `name: CI

on:
  push:
    branches: [main]

jobs:
  # a comment between jobs
  check:
    name: pnpm check
    runs-on: ubuntu-latest
    steps:
      - name: not a job name
        run: echo hi
  quoted:
    name: 'PR rules' # trailing comment
    steps: []
  unnamed:
    runs-on: ubuntu-latest
`;

test('reads job names, quoted names and job ids, but not step names', () => {
  assert.deepEqual(jobNames(WORKFLOW), ['pnpm check', 'PR rules', 'unnamed']);
});

test('the committed ruleset matches the committed ci.yml', () => {
  assert.deepEqual(checkRuleset(realRuleset(), realNames()), []);
});

test('ci.yml has a job for each of the five expected contexts', () => {
  for (const context of EXPECTED_CONTEXTS) assert.ok(realNames().includes(context), context);
});

test('fails when a required context is renamed', () => {
  const ruleset = realRuleset();
  const checks = ruleset.rules.find((r) => r.type === 'required_status_checks').parameters
    .required_status_checks;
  checks.find((c) => c.context === 'verify').context = 'verify-game';
  assert.deepEqual(checkRuleset(ruleset, realNames()), [
    'required context "verify-game" is not a job name in ci.yml',
    'required context "verify" is missing',
  ]);
});

test('fails when a CI job is renamed but the ruleset is not', () => {
  const names = realNames().map((n) => (n === 'server image' ? 'server-image' : n));
  assert.deepEqual(checkRuleset(realRuleset(), names), [
    'required context "server image" is not a job name in ci.yml',
  ]);
});

test('fails when a context is removed or duplicated', () => {
  const ruleset = realRuleset();
  const params = ruleset.rules.find((r) => r.type === 'required_status_checks').parameters;
  params.required_status_checks = params.required_status_checks.filter(
    (c) => c.context !== 'repo rules',
  );
  params.required_status_checks.push({ context: 'pnpm check', integration_id: 15368 });
  assert.deepEqual(checkRuleset(ruleset, realNames()), [
    'required context "repo rules" is missing',
    'required context "pnpm check" is listed twice',
  ]);
});

test('fails on bypass actors, other merge methods, a lax policy or a wrong integration', () => {
  const ruleset = realRuleset();
  ruleset.bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }];
  ruleset.rules.find((r) => r.type === 'pull_request').parameters.allowed_merge_methods = [
    'squash',
    'merge',
  ];
  const params = ruleset.rules.find((r) => r.type === 'required_status_checks').parameters;
  params.strict_required_status_checks_policy = false;
  params.required_status_checks[0].integration_id = 1;
  ruleset.rules = ruleset.rules.filter((r) => r.type !== 'non_fast_forward');
  assert.deepEqual(checkRuleset(ruleset, realNames()), [
    'required context "pnpm check" must have integration_id 15368 (GitHub Actions)',
    'strict_required_status_checks_policy must be true (branches up to date)',
    'bypass_actors must be an empty list (nobody bypasses the ruleset)',
    'the pull_request rule must allow only the squash merge method',
    'the ruleset has no non_fast_forward rule',
  ]);
});

test('fails when the required_status_checks rule is gone', () => {
  const ruleset = realRuleset();
  ruleset.rules = ruleset.rules.filter((r) => r.type !== 'required_status_checks');
  assert.deepEqual(checkRuleset(ruleset, realNames()), [
    'the ruleset has no required_status_checks rule',
  ]);
});
