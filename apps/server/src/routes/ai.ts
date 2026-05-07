import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eq, inArray } from "drizzle-orm";
import { ChatMessageSchema, CreateConversationSchema } from "@finwise/shared/schemas";
import { AIService } from "../ai/ai.service";
import { deleteMemory } from "../ai/chat-memory";
import { AI_CONFIG } from "../config/ai.config";
import { getDb } from "../db/index";
import { ai_conversations, ai_messages, ai_tool_calls } from "../db/schema";

export const aiRouter = new Hono();
const aiService = new AIService();

function handleError(c: any, err: unknown) {
  const e = err as { status?: number; message?: string; name?: string };
  if (e.name === "OllamaConnectionError") {
    return c.json({ error: "AI service unavailable — Ollama is not running" }, 503);
  }
  if (e.status === 404) return c.json({ error: e.message ?? "Not found" }, 404);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
}

// ─── Status ───────────────────────────────────────────────────────────────────

aiRouter.get("/status", async (c) => {
  try {
    const status = await aiService.getStatus();
    return c.json(status);
  } catch (err) {
    return handleError(c, err);
  }
});

// ─── Start Ollama ─────────────────────────────────────────────────────────────

aiRouter.post("/start-ollama", async (c) => {
  try {
    // Check if already running first
    const status = await aiService.getStatus();
    if (status.connected) {
      return c.json({ started: true, message: "Ollama is already running" });
    }

    const { spawn } = await import("node:child_process");

    // On macOS, bundled apps have a stripped PATH — explicitly add common install locations
    const extraPaths = [
      "/usr/local/bin",          // Intel Mac Homebrew
      "/opt/homebrew/bin",       // Apple Silicon Homebrew
      "/usr/bin",
      "/bin",
    ].join(":");
    const spawnEnv = {
      ...process.env,
      PATH: `${extraPaths}:${process.env.PATH ?? ""}`,
    };

    // Try `ollama serve` — detached so it outlives this request
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
      env: spawnEnv,
    });
    child.unref(); // let it run independently of this process

    if (child.pid == null) {
      return c.json({ started: false, message: "Failed to spawn Ollama — is it installed?" }, 500);
    }

    // Give it up to 8s to become reachable
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 600));
      const check = await aiService.getStatus();
      if (check.connected) {
        return c.json({ started: true, message: "Ollama started successfully" });
      }
    }

    return c.json({ started: false, message: "Ollama launched but did not respond in time — it may still be starting up" });
  } catch (err) {
    console.error("[start-ollama]", err);
    return c.json({ started: false, message: "Could not start Ollama — make sure it is installed and on PATH" }, 500);
  }
});

// ─── Singleton chat (single persistent context) ───────────────────────────────

aiRouter.get("/messages", async (c) => {
  try {
    const messages = await aiService.getSingletonMessages();
    return c.json({ messages });
  } catch (err) {
    return handleError(c, err);
  }
});

aiRouter.post("/clear", async (c) => {
  try {
    await aiService.clearSingleton();
    return c.json({ success: true });
  } catch (err) {
    return handleError(c, err);
  }
});

aiRouter.get("/chat", async (c) => {
  const message = c.req.query("message");
  if (!message?.trim()) return c.json({ error: "message query param required" }, 400);
  const model = c.req.query("model") || undefined;
  const currency = c.req.query("currency") || "INR";

  return streamSSE(c, async (stream) => {
    try {
      for await (const token of aiService.stream(AI_CONFIG.singletonConvId, message, model, currency)) {
        await stream.writeSSE({ data: token, event: "token" });
      }
      await stream.writeSSE({ data: "[DONE]", event: "done" });
    } catch (err) {
      const e = err as { name?: string; message?: string };
      console.error("[ai/chat singleton]", err);
      const errorMsg =
        e.name === "OllamaConnectionError"
          ? "AI service unavailable — Ollama is not running"
          : (e.message ?? "Unknown error from AI service");
      await stream.writeSSE({ data: errorMsg, event: "error" });
    }
  });
});

// ─── Conversations ────────────────────────────────────────────────────────────

aiRouter.get("/conversations", async (c) => {
  const db = getDb();
  try {
    const conversations = await db
      .select({
        id: ai_conversations.id,
        title: ai_conversations.title,
        created_at: ai_conversations.created_at,
        updated_at: ai_conversations.updated_at,
      })
      .from(ai_conversations)
      .orderBy(ai_conversations.updated_at);
    return c.json({ conversations });
  } catch (err) {
    return handleError(c, err);
  }
});

aiRouter.post("/conversations", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreateConversationSchema.safeParse({ title: body.title ?? "New Conversation" });
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error }, 400);

  const db = getDb();
  try {
    const [row] = await db.insert(ai_conversations).values(parsed.data).returning();
    return c.json(row, 201);
  } catch (err) {
    return handleError(c, err);
  }
});

aiRouter.delete("/conversations/:id", async (c) => {
  const db = getDb();
  const convId = c.req.param("id");
  try {
    // Must delete in FK order: tool_calls → messages → conversation
    const messages = await db
      .select({ id: ai_messages.id })
      .from(ai_messages)
      .where(eq(ai_messages.conversation_id, convId));

    if (messages.length > 0) {
      const msgIds = messages.map((m) => m.id);
      await db.delete(ai_tool_calls).where(inArray(ai_tool_calls.message_id, msgIds));
      await db.delete(ai_messages).where(eq(ai_messages.conversation_id, convId));
    }

    const result = await db
      .delete(ai_conversations)
      .where(eq(ai_conversations.id, convId))
      .returning();
    if (result.length === 0) return c.json({ error: "Conversation not found" }, 404);

    // Clean up memory file (best-effort)
    await deleteMemory(convId).catch(() => {});

    return c.json({ success: true });
  } catch (err) {
    return handleError(c, err);
  }
});

// ─── Messages ─────────────────────────────────────────────────────────────────

aiRouter.get("/conversations/:id/messages", async (c) => {
  const db = getDb();
  try {
    const messages = await db
      .select()
      .from(ai_messages)
      .where(eq(ai_messages.conversation_id, c.req.param("id")))
      .orderBy(ai_messages.created_at);
    return c.json({ messages });
  } catch (err) {
    return handleError(c, err);
  }
});

// ─── Audit trail ──────────────────────────────────────────────────────────────

aiRouter.get("/conversations/:id/audit", async (c) => {
  const db = getDb();
  try {
    const messages = await db
      .select({ id: ai_messages.id })
      .from(ai_messages)
      .where(eq(ai_messages.conversation_id, c.req.param("id")));

    const messageIds = messages.map((m) => m.id);
    if (messageIds.length === 0) return c.json({ tool_calls: [] });

    const toolCalls = await db.select().from(ai_tool_calls);
    const filtered = toolCalls.filter((tc) => messageIds.includes(tc.message_id));
    return c.json({ tool_calls: filtered });
  } catch (err) {
    return handleError(c, err);
  }
});

// ─── SSE Streaming Chat ───────────────────────────────────────────────────────
// EventSource (browser) is GET-only — the message is passed as a query param.
// We keep the POST route too for any future non-EventSource callers.

async function handleChatStream(c: any, message: string) {
  const parsed = ChatMessageSchema.safeParse({
    conversation_id: c.req.param("id"),
    content: message,
  });
  if (!parsed.success) return c.json({ error: "Validation failed", details: parsed.error }, 400);

  return streamSSE(c, async (stream) => {
    try {
      for await (const token of aiService.stream(c.req.param("id"), message)) {
        await stream.writeSSE({ data: token, event: "token" });
      }
      await stream.writeSSE({ data: "[DONE]", event: "done" });
    } catch (err) {
      const e = err as { name?: string; message?: string };
      const errorMsg =
        e.name === "OllamaConnectionError"
          ? "AI service unavailable — Ollama is not running"
          : "Stream error";
      await stream.writeSSE({ data: errorMsg, event: "error" });
    }
  });
}

// GET — used by EventSource (browser SSE)
aiRouter.get("/conversations/:id/chat", async (c) => {
  const message = c.req.query("message");
  if (!message?.trim()) return c.json({ error: "message query param required" }, 400);
  return handleChatStream(c, message);
});

// POST — kept for completeness / non-browser callers
aiRouter.post("/conversations/:id/chat", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.message?.trim()) return c.json({ error: "message body field required" }, 400);
  return handleChatStream(c, body.message);
});
