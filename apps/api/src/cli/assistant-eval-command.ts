export type EvalCliArgs = {
  mode: 'fake' | 'real' | null;
  caseId: string | null;
  help: boolean;
  unknown: string[];
};

export function parseAssistantEvalArgs(argv: string[]): EvalCliArgs {
  const unknown: string[] = [];
  let mode: 'fake' | 'real' | null = null;
  let caseId: string | null = null;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--mode') {
      const value = argv[index + 1];
      index += 1;
      if (value === 'fake' || value === 'real') {
        mode = value;
      } else {
        unknown.push(`--mode ${value ?? ''}`.trim());
      }
      continue;
    }
    if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length);
      if (value === 'fake' || value === 'real') {
        mode = value;
      } else {
        unknown.push(arg);
      }
      continue;
    }
    if (arg === '--case') {
      const value = argv[index + 1];
      index += 1;
      if (value != null && value.length > 0) {
        caseId = value;
      } else {
        unknown.push('--case');
      }
      continue;
    }
    if (arg.startsWith('--case=')) {
      caseId = arg.slice('--case='.length);
      continue;
    }
    unknown.push(arg);
  }

  return { mode, caseId, help, unknown };
}
