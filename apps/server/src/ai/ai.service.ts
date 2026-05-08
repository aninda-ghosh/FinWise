import { eq, inArray } from "drizzle-orm";
import { AI_CONFIG } from "../config/ai.config";
import { getDb } from "../db/index";
import { ai_conversations, ai_messages, ai_tool_calls } from "../db/schema";
import { appendExchange, deleteMemory } from "./chat-memory";
import { buildSystemContext } from "./context.builder";
import { OllamaClient, type OllamaMessage } from "./ollama.client";
import { getFinancialAdvisorPrompt } from "./prompts/financial-advisor";

export type AIResponse = {
  id: string;
  conversation_id: string;
  role: "assistant";
  content: string;
  confidence: "high" | "medium" | "low" | null;
  sources_json: string | null;
  created_at: string;
};

function extractConfidence(text: string): "high" | "medium" | "low" | null {
  const upper = text.toUpperCase();
  if (upper.includes("CONFIDENCE: HIGH") || upper.includes("[HIGH]")) return "high";
  if (upper.includes("CONFIDENCE: MEDIUM") || upper.includes("[MEDIUM]")) return "medium";
  if (upper.includes("CONFIDENCE: LOW") || upper.includes("[LOW]")) return "low";
  return null;
}

function extractSources(text: string): string | null {
  const matches = [...text.matchAll(/\[Tool: ([^\]]+)\]/g)];
  if (matches.length === 0) return null;
  return JSON.stringify(matches.map((m) => m[1]));
}

export class AIService {
  private client = new OllamaClient();

  // ─── Load conversation history ─────────────────────────────────────────────

  private async loadHistory(conversationId: string): Promise<OllamaMessage[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(ai_messages)
      .where(eq(ai_messages.conversation_id, conversationId))
      .orderBy(ai_messages.created_at);

    // Truncate to last N messages to prevent context window overflow
    const recent = rows.slice(-AI_CONFIG.maxHistoryMessages);
    return recent.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
    }));
  }

  // ─── Ensure conversation exists ────────────────────────────────────────────

  private async ensureConversation(conversationId: string): Promise<void> {
    const db = getDb();
    const existing = await db
      .select({ id: ai_conversations.id })
      .from(ai_conversations)
      .where(eq(ai_conversations.id, conversationId));

    if (existing.length === 0) {
      await db.insert(ai_conversations).values({
        id: conversationId,
        title: "New Conversation",
      });
    }
  }

  // ─── Save user message ─────────────────────────────────────────────────────

  private async saveUserMessage(conversationId: string, content: string) {
    const db = getDb();
    const [row] = await db
      .insert(ai_messages)
      .values({ conversation_id: conversationId, role: "user", content })
      .returning();
    return row;
  }

  // ─── Save assistant message ────────────────────────────────────────────────

  private async saveAssistantMessage(
    conversationId: string,
    content: string
  ): Promise<AIResponse> {
    const db = getDb();
    const confidence = extractConfidence(content);
    const sources_json = extractSources(content);

    const [row] = await db
      .insert(ai_messages)
      .values({ conversation_id: conversationId, role: "assistant", content, confidence, sources_json })
      .returning();

    return {
      id: row.id,
      conversation_id: row.conversation_id,
      role: "assistant",
      content: row.content,
      confidence: row.confidence as AIResponse["confidence"],
      sources_json: row.sources_json ?? null,
      created_at: row.created_at ?? new Date().toISOString(),
    };
  }

  // ─── Build full message array for Ollama ───────────────────────────────────

  private async buildMessages(
    conversationId: string,
    userMessage: string,
    displayCurrency = "INR"
  ): Promise<OllamaMessage[]> {
    const [context, history] = await Promise.all([
      buildSystemContext(displayCurrency),
      this.loadHistory(conversationId),
    ]);

    const systemMessage: OllamaMessage = {
      role: "system",
      content: `${getFinancialAdvisorPrompt(displayCurrency)}\n\n${context}`,
    };

    return [systemMessage, ...history, { role: "user", content: userMessage }];
  }

  // ─── Public: streaming chat ────────────────────────────────────────────────
  // No tool-calling loop — all financial data is pre-loaded in the system prompt.
  // This ensures compatibility with small models like gemma3:4b.

  async *stream(conversationId: string, userMessage: string, model?: string, displayCurrency = "INR"): AsyncGenerator<string> {
    await this.ensureConversation(conversationId);
    await this.saveUserMessage(conversationId, userMessage);

    const db = getDb();
    const messages = await this.buildMessages(conversationId, userMessage, displayCurrency);

    // Stream directly from Ollama
    let fullContent = "";
    for await (const token of this.client.stream(messages, undefined, model)) {
      fullContent += token;
      yield token;
    }

    // Persist completed assistant message
    await db
      .insert(ai_messages)
      .values({ conversation_id: conversationId, role: "assistant", content: fullContent });

    // Persist exchange to memory file
    await appendExchange(conversationId, userMessage, fullContent).catch(() => {});
  }

  // ─── Singleton helpers ─────────────────────────────────────────────────────

  async getSingletonMessages() {
    const db = getDb();
    await this.ensureConversation(AI_CONFIG.singletonConvId);
    return db
      .select()
      .from(ai_messages)
      .where(eq(ai_messages.conversation_id, AI_CONFIG.singletonConvId))
      .orderBy(ai_messages.created_at);
  }

  async clearSingleton() {
    const db = getDb();
    const msgs = await db
      .select({ id: ai_messages.id })
      .from(ai_messages)
      .where(eq(ai_messages.conversation_id, AI_CONFIG.singletonConvId));
    if (msgs.length > 0) {
      await db.delete(ai_tool_calls).where(inArray(ai_tool_calls.message_id, msgs.map(m => m.id)));
      await db.delete(ai_messages).where(eq(ai_messages.conversation_id, AI_CONFIG.singletonConvId));
    }
    await deleteMemory(AI_CONFIG.singletonConvId).catch(() => {});
  }

  // ─── Status check ──────────────────────────────────────────────────────────

  async getStatus(): Promise<{ connected: boolean; model: string; model_available: boolean; available_models: string[] }> {
    const [connected, available_models] = await Promise.all([
      this.client.ping(),
      this.client.listModels(),
    ]);
    const model_available = connected && available_models.some(m => m === AI_CONFIG.model || m.startsWith(AI_CONFIG.model));
    return { connected, model: AI_CONFIG.model, model_available, available_models };
  }
}
