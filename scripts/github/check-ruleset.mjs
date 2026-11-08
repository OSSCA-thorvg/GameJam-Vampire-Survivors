// Ruleset check (#74, ADR 0015): the required status checks in .github/rulesets/main.json are matched by GitHub
// against CI job names as plain strings, so a renamed job would make every PR unmergeable without any error here.
// This fails when a required context is not a job `name:` in .github/workflows/ci.yml, when one of the five
// expected contexts is missing, or when the ruleset loses its no-bypass, squash-only or strict up-to-date settings.
// Usage: node scripts/github/check-ruleset.mjs [--ruleset <path>] [--workflow <path>]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The CI jobs every PR must pass (ADR 0015). */
export const EXPECTED_CONTEXTS = ['pnpm check', 'verify', 'repo rules', 'server image', 'PR rules'];

/** GitHub Actions' app id, the source the required checks must come from. */
export const GITHUB_ACTIONS_INTEGRATION_ID = 15368;

/** Strips a trailing YAML comment and surrounding quotes from a scalar. */
function scalar(raw) {
  const value = raw.trim();
  if (value.startsWith("'") || value.startsWith('"')) {
    const quote = value[0];
    const end = value.indexOf(quote, 1);
    return end === -1 ? value.slice(1) : value.slice(1, end);
  }
  return value.replace(/\s+#.*$/, '').trim();
}

/**
 * Reads the check names of the jobs in a workflow: each job's `name:`, or its id when it has none.
 * Only the layout ci.yml uses is supported (two-space indentation, `jobs:` at the top level).
 */
export function jobNames(workflowText) {
  const names = [];
  let inJobs = false;
  let current = null;
  const flush = () => {
    if (current) names.push(current.name ?? current.id);
    current = null;
  };
  for (const line of workflowText.split(/\r?\n/)) {
    if (/^\S/.test(line) && !line.startsWith('#')) {
      flush();
      inJobs = /^jobs:\s*(#.*)?$/.test(line);
      continue;
    }
    if (!inJobs) continue;
    const job = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
    if (job) {
      flush();
      current = { id: job[1], name: undefined };
      continue;
    }
    const name = /^ {4}name:(.*)$/.exec(line);
    if (name && current && current.name === undefined) current.name = scalar(name[1]);
  }
  flush();
  return names;
}

/** Returns the problems found in a ruleset against the workflow's job names; empty when it is consistent. */
export function checkRuleset(ruleset, names, expected = EXPECTED_CONTEXTS) {
  const errors = [];
  const rules = Array.isArray(ruleset?.rules) ? ruleset.rules : [];
  const rule = (type) => rules.find((r) => r?.type === type);

  const checks = rule('required_status_checks')?.parameters?.required_status_checks;
  if (!Array.isArray(checks)) {
    errors.push('the ruleset has no required_status_checks rule');
  } else {
    const contexts = checks.map((c) => c?.context);
    for (const context of contexts) {
      if (!names.includes(context))
        errors.push(`required context "${context}" is not a job name in ci.yml`);
    }
    for (const context of expected) {
      if (!contexts.includes(context)) errors.push(`required context "${context}" is missing`);
    }
    const duplicates = contexts.filter((c, i) => contexts.indexOf(c) !== i);
    for (const context of new Set(duplicates))
      errors.push(`required context "${context}" is listed twice`);
    for (const check of checks) {
      if (check?.integration_id !== GITHUB_ACTIONS_INTEGRATION_ID)
        errors.push(
          `required context "${check?.context}" must have integration_id ${GITHUB_ACTIONS_INTEGRATION_ID} (GitHub Actions)`,
        );
    }
    if (rule('required_status_checks').parameters.strict_required_status_checks_policy !== true)
      errors.push('strict_required_status_checks_policy must be true (branches up to date)');
  }

  if (!Array.isArray(ruleset?.bypass_actors) || ruleset.bypass_actors.length !== 0)
    errors.push('bypass_actors must be an empty list (nobody bypasses the ruleset)');
  if (ruleset?.enforcement !== 'active') errors.push('enforcement must be "active"');
  const methods = rule('pull_request')?.parameters?.allowed_merge_methods;
  if (!Array.isArray(methods) || methods.length !== 1 || methods[0] !== 'squash')
    errors.push('the pull_request rule must allow only the squash merge method');
  for (const type of ['deletion', 'non_fast_forward', 'required_linear_history']) {
    if (!rule(type)) errors.push(`the ruleset has no ${type} rule`);
  }
  return errors;
}

function main(argv) {
  let rulesetPath = join(ROOT, '.github', 'rulesets', 'main.json');
  let workflowPath = join(ROOT, '.github', 'workflows', 'ci.yml');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--ruleset') rulesetPath = argv[++i];
    else if (argv[i] === '--workflow') workflowPath = argv[++i];
    else {
      console.error(`Unknown argument: ${argv[i]}`);
      return 2;
    }
  }
  const ruleset = JSON.parse(readFileSync(rulesetPath, 'utf8'));
  const names = jobNames(readFileSync(workflowPath, 'utf8'));
  const errors = checkRuleset(ruleset, names);
  if (errors.length > 0) {
    for (const error of errors) console.error(`::error file=${rulesetPath}::${error}`);
    console.error(`CI job names: ${names.join(', ')}`);
    return 1;
  }
  process.stdout.write(
    `Ruleset matches CI: ${EXPECTED_CONTEXTS.map((c) => `"${c}"`).join(', ')} are CI job names.\n`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
