import { apiFetch, BASE_URL, getToken } from "@/lib/api";

export type StreamChatCallbacks = {
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
};

export const chatApi = {
  // Singleton chat
  getMessages: () => apiFetch<{ messages: any[] }>("/api/ai/messages"),
  clearChat: () => apiFetch<{ success: boolean }>("/api/ai/clear", { method: "POST" }),
  streamChat: (message: string, callbacks: StreamChatCallbacks, model?: string, currency?: string): AbortController => {
    const params = new URLSearchParams({ message });
    if (model) params.set("model", model);
    if (currency) params.set("currency", currency);

    const controller = new AbortController();
    const token = getToken();
    const headers: Record<string, string> = { Accept: "text/event-stream" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/ai/chat?${params}`, {
          headers,
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          callbacks.onError(err.error ?? `HTTP ${res.status}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          let eventName = "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              const data = line.slice(5).trim();
              if (eventName === "token") {
                callbacks.onToken(data);
              } else if (eventName === "done") {
                callbacks.onDone();
                return;
              } else if (eventName === "error") {
                try {
                  const parsed = JSON.parse(data);
                  callbacks.onError(parsed.error ?? data);
                } catch {
                  callbacks.onError(data);
                }
                return;
              }
              eventName = "";
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          callbacks.onError(err?.message ?? "Stream error");
        }
      }
    })();

    return controller;
  },
  getStatus: () => apiFetch<{ connected: boolean; model: string; model_available: boolean; available_models: string[] }>("/api/ai/status"),
  startOllama: () =>
    apiFetch<{ started: boolean; message: string }>("/api/ai/start-ollama", { method: "POST" }),
};
