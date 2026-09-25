import { fileURLToPath } from 'node:url';

import '../infrastructure/config/load-env.js';

import { disconnectPrisma } from '../infrastructure/database/index.js';
import { defaultEvalPaths, runAssistantEval } from '../features/assistant/eval/index.js';
import { parseAssistantEvalArgs } from './assistant-eval-command.js';

const USAGE =
  'Usage: assistant:eval --mode=fake|real [--case <id>]\n' +
  'Runs the Feature 17 AI-010 evaluation suite (local-fake or local-real).';

const ASSISTANT_EVAL_DIRECTORY = fileURLToPath(
  new URL('../../../../docs/assistant-eval', import.meta.url),
);

async function main(): Promise<void> {
  const args = parseAssistantEvalArgs(process.argv.slice(2));

  if (args.help) {
    console.log(USAGE);
    console.log('Writes a JSON report under docs/assistant-eval/reports/.');
    console.log('Exactitud ≥90% requires human review of the real-mode report (decision 5B).');
    process.exitCode = 0;
    return;
  }

  if (args.unknown.length > 0) {
    console.error(`Unknown arguments: ${args.unknown.join(', ')}`);
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  if (args.mode == null) {
    console.error('Missing required --mode=fake|real');
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }

  try {
    const paths = defaultEvalPaths(ASSISTANT_EVAL_DIRECTORY);
    const report = await runAssistantEval({
      mode: args.mode,
      datasetPath: paths.datasetPath,
      pricingPath: paths.pricingPath,
      reportPath: paths.reportPath,
      caseId: args.caseId ?? undefined,
    });

    console.log(`Mode: ${report.mode} (${report.environment})`);
    console.log(`Dataset: ${report.datasetVersion}`);
    console.log(`Cases passed: ${report.aggregate.passedCases}/${report.aggregate.totalCases}`);
    console.log(
      `Hard gates: ${report.hardGates.passed ? 'PASS' : 'FAIL'}`,
    );
    if (report.hardGates.failures.length > 0) {
      for (const failure of report.hardGates.failures) {
        console.error(`  - ${failure}`);
      }
    }
    console.log(`Estimated cost USD: ${report.aggregate.estimatedCostUsd.toFixed(6)}`);
    console.log(`Report: ${paths.reportPath}`);
    console.log(
      'Human accuracy review: pending — update the report after reviewing local-real answers.',
    );

    process.exitCode = report.hardGates.passed ? 0 : 1;
  } catch (error) {
    console.error('Assistant eval failed.');
    if (error instanceof Error && error.message) {
      console.error(error.message);
    }
    process.exitCode = 1;
  } finally {
    await disconnectPrisma();
  }
}

void main();
