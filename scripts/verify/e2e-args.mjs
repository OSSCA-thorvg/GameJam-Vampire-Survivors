/** Separate harness options from Playwright options without rewriting the latter. */
export function parseE2eArgs(argv) {
  const launch = [];
  const playwright = [];
  let issue;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--with-server') {
      launch.push(arg);
    } else if (arg === '--issue') {
      const value = argv[++i];
      if (!/^\d+$/.test(value ?? '')) throw new Error('--issue requires a numeric issue number');
      issue = value;
    } else if (arg.startsWith('--issue=')) {
      throw new Error('Use --issue <N>');
    } else {
      playwright.push(arg);
    }
  }
  return { launch, playwright, evidence: issue ? ['--issue', issue] : [] };
}
