-- PENDING/FAILED/CANCELLED assistant messages may persist empty content (M5 lifecycle).
-- USER messages and COMPLETED assistant messages must keep non-empty content.
ALTER TABLE "AssistantMessage" DROP CONSTRAINT "AssistantMessage_content_check";

ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_content_check" CHECK (
  "status" IN ('PENDING', 'FAILED', 'CANCELLED')
  OR length(btrim("content")) > 0
);
