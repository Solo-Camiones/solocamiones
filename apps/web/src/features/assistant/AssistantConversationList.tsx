import { useState } from 'react';

import { Button, ConfirmActionModal } from '../../shared/ui';
import { useAssistant } from './AssistantProvider';

export function AssistantConversationList() {
  const {
    conversations,
    conversationsHasMore,
    conversationsLoading,
    loadMoreConversations,
    selectedConversationId,
    selectConversation,
    createConversation,
    deleteConversation,
  } = useAssistant();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    setDeleting(true);
    await deleteConversation(pendingDeleteId);
    setDeleting(false);
    setPendingDeleteId(null);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-navy-100 bg-navy-50/40 sm:w-56">
      <div className="flex items-center justify-between gap-2 border-b border-navy-100 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Historial</p>
        <Button variant="secondary" size="sm" onClick={() => void createConversation()}>
          Nueva
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {conversations.map((conversation) => {
          const selected = conversation.id === selectedConversationId;
          return (
            <li key={conversation.id} className="mb-1">
              <div
                className={`flex items-stretch gap-1 rounded-lg ${
                  selected ? 'bg-white shadow-sm ring-1 ring-navy-100' : 'hover:bg-white/70'
                }`}
              >
                <button
                  type="button"
                  className="min-h-11 min-w-0 flex-1 truncate px-2 py-2 text-left text-sm text-navy"
                  onClick={() => void selectConversation(conversation.id)}
                >
                  {conversation.title || 'Sin título'}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-navy-400 hover:text-red-600"
                  aria-label={`Eliminar conversación ${conversation.title}`}
                  onClick={() => setPendingDeleteId(conversation.id)}
                >
                  ×
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {conversationsHasMore ? (
        <div className="border-t border-navy-100 p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            busy={conversationsLoading}
            onClick={() => void loadMoreConversations()}
          >
            Cargar más
          </Button>
        </div>
      ) : null}

      <ConfirmActionModal
        open={pendingDeleteId != null}
        title="Eliminar conversación"
        confirmLabel="Eliminar"
        confirmVariant="danger"
        busy={deleting}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      >
        <p className="text-sm text-navy-400">
          Se eliminará el historial de esta conversación. Esta acción no se puede deshacer.
        </p>
      </ConfirmActionModal>
    </div>
  );
}
