import type { ChatMessage } from 'chatgpt'

export interface RequestOptions {
  ip: string
  message: string
  lastContext?: { conversationId?: string; parentMessageId?: string }
  process?: (chat: ChatMessage) => void
  systemMessage?: string
  engine?: string
}
