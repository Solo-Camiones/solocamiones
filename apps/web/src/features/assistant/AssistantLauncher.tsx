import { Button } from '../../shared/ui';
import { ASSISTANT_PANEL_ID } from './AssistantPanel';
import { useAssistant } from './AssistantProvider';

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="currentColor"
        d="M12 3.5 13.2 8l4.8 1.2L13.2 10.4 12 14.9l-1.2-4.5L6 9.2 10.8 8 12 3.5Zm6.5 8.5 0.7 2.5 2.5.7-2.5.7-.7 2.5-.7-2.5-2.5-.7 2.5-.7.7-2.5ZM6.5 14l.6 2.1 2.1.6-2.1.6-.6 2.1-.6-2.1-2.1-.6 2.1-.6.6-2.1Z"
      />
    </svg>
  );
}

export function AssistantLauncher() {
  const { open, openPanel, closePanel } = useAssistant();

  return (
    <Button
      variant="secondary"
      size="icon"
      aria-label={open ? 'Cerrar asistente' : 'Abrir asistente'}
      aria-expanded={open}
      aria-controls={ASSISTANT_PANEL_ID}
      onClick={() => (open ? closePanel() : openPanel())}
    >
      <SparkleIcon />
    </Button>
  );
}
