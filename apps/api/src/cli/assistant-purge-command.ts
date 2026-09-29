export type PurgeCliArgs = {
  dryRun: boolean;
  help: boolean;
  unknown: string[];
};

export function parseAssistantPurgeArgs(argv: string[]): PurgeCliArgs {
  const unknown: string[] = [];
  let dryRun = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    unknown.push(arg);
  }

  return { dryRun, help, unknown };
}
