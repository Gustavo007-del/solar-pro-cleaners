import { z } from 'zod';

import { queryPath } from './client';
import { customerRequest } from './session';

const timestamp = z.iso.datetime({ offset: true });
const conversation = z.object({ id: z.uuid(), title: z.string(), revision: z.number().int(), updated_at: timestamp });
const message = z.object({
  id: z.uuid(), role: z.enum(['user', 'assistant']), content: z.string(), position: z.number().int(), created_at: timestamp,
});
const turn = z.object({ conversation, messages: z.array(message) });
const conversationPage = z.object({ items: z.array(conversation), page: z.number().int(), has_next: z.boolean() });
const messagePage = z.object({ conversation, items: z.array(message), next_before: z.number().int().nullable() });
const timeoutMs = 75_000;

export type AssistantConversation = z.infer<typeof conversation>;
export type AssistantMessage = z.infer<typeof message>;
export type AssistantTurn = z.infer<typeof turn>;

export const assistant = {
  conversations: (page = 1) => customerRequest(queryPath('/ai/conversations', { page }), conversationPage, { timeoutMs }),
  messages: (id: string, before?: number | null) =>
    customerRequest(queryPath(`/ai/conversations/${id}/messages`, { before }), messagePage, { timeoutMs }),
  send: (requestId: string, conversationId: string | undefined, content: string) =>
    customerRequest('/ai/chat', turn, { method: 'POST', timeoutMs,
      body: { request_id: requestId, conversation_id: conversationId, message: content } }),
  regenerate: (requestId: string, current: AssistantConversation) =>
    customerRequest(`/ai/conversations/${current.id}/regenerate`, turn, { method: 'POST', timeoutMs,
      body: { request_id: requestId, revision: current.revision } }),
  clear: (id: string) => customerRequest(`/ai/conversations/${id}`, z.undefined(), { method: 'DELETE', timeoutMs }),
};
