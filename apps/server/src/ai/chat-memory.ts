import { promises as fs } from "node:fs";
import * as path from "node:path";

// Store memories in a sibling directory next to the server's working directory
const MEMORIES_DIR = path.join(process.cwd(), "chat-memories");

async function ensureDir() {
  await fs.mkdir(MEMORIES_DIR, { recursive: true });
}

function filePath(conversationId: string) {
  return path.join(MEMORIES_DIR, `${conversationId}.md`);
}

// ─── Read memory for a conversation ───────────────────────────────────────────

export async function readMemory(conversationId: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath(conversationId), "utf-8");
    return content.trim() || null;
  } catch {
    return null;
  }
}

// ─── Append an exchange to the memory file ────────────────────────────────────

export async function appendExchange(
  conversationId: string,
  userMessage: string,
  assistantMessage: string
): Promise<void> {
  await ensureDir();
  const fp = filePath(conversationId);

  let existing = "";
  try {
    existing = await fs.readFile(fp, "utf-8");
  } catch {
    // File doesn't exist yet — start fresh
    existing = `# Chat Memory: ${conversationId}\n\n`;
  }

  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const exchange = [
    `---`,
    `**[${timestamp}] User:** ${userMessage.trim()}`,
    ``,
    `**Assistant:** ${assistantMessage.trim()}`,
    ``,
  ].join("\n");

  await fs.writeFile(fp, existing + exchange, "utf-8");
}

// ─── Delete memory for a conversation ─────────────────────────────────────────

export async function deleteMemory(conversationId: string): Promise<void> {
  try {
    await fs.unlink(filePath(conversationId));
  } catch {
    // Already gone — no-op
  }
}
