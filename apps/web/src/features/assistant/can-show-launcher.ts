import type { Role } from '../../api/contracts/entities';

/** Shared gate for AppShell launcher visibility (AI-001 + M7 capability). */
export function canShowAssistantLauncher(input: {
  role: Role;
  mustChangePassword: boolean;
  assistantCapability: boolean;
  hasRepository: boolean;
}): boolean {
  return (
    !input.mustChangePassword &&
    input.role === 'ADMINISTRATOR' &&
    input.assistantCapability &&
    input.hasRepository
  );
}
