import { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tokens_used?: number;
  error?: boolean;
}

interface SecretomeChatProps {
  jobId: string;
}

export default function SecretomeChat({ jobId }: SecretomeChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [totalTokens, setTotalTokens] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen && suggestions.length === 0 && messages.length === 0) {
      loadSuggestions();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const loadSuggestions = async () => {
    setSuggestionsLoading(true);
    try {
      const res = await fetch(`/api/v1/conversations/${jobId}/suggestions`);
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch {
      // silent
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = {
      role: "user",
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setSuggestions([]);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`/api/v1/conversations/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          timestamp: new Date().toISOString(),
          tokens_used: data.tokens_used,
          error: data.error,
        },
      ]);
      setTotalTokens((prev) => prev + (data.tokens_used || 0));
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Connection error. Check that the backend is running and try again.",
          timestamp: new Date().toISOString(),
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setTotalTokens(0);
    loadSuggestions();
  };

  const exportChat = () => {
    const text = messages
      .map(
        (m) =>
          `[${m.role.toUpperCase()}] ${new Date(m.timestamp).toLocaleTimeString()}\n${m.content}`
      )
      .join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `secretome_qa_${jobId.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Highlight gene symbols (2–8 uppercase letters+digits)
  const highlightGenes = (text: string) => {
    const parts = text.split(/\b([A-Z][A-Z0-9]{1,7})\b/g);
    return parts.map((part, i) =>
      i % 2 === 1 && /^[A-Z][A-Z0-9]{1,7}$/.test(part) ? (
        <span
          key={i}
          className="inline-block bg-blue-50 text-blue-900 px-0.5 rounded font-mono text-[0.88em] font-semibold"
        >
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────── */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 ${
          isOpen ? "bg-blue-800" : "bg-blue-600 hover:bg-blue-700"
        }`}
      >
        <span className="text-lg">🔬</span>
        {isOpen ? "Close Assistant" : "Ask about results"}
        {messages.length > 0 && !isOpen && (
          <span className="ml-1 rounded-full bg-red-500 px-2 py-0.5 text-xs">
            {messages.filter((m) => m.role === "user").length}
          </span>
        )}
      </button>

      {/* ── Chat panel ─────────────────────────────────────────── */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40 flex w-[420px] max-h-[600px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                🔬 Research Assistant
              </p>
              <p className="text-xs text-gray-400">
                Powered by Claude · Ask anything about your results
              </p>
            </div>
            <div className="flex gap-1.5">
              {messages.length > 0 && (
                <>
                  <button
                    onClick={exportChat}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    Export
                  </button>
                  <button
                    onClick={clearChat}
                    className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-500 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠️ AI-generated interpretation. Validate findings experimentally before publication.
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* Empty state — suggestions */}
            {messages.length === 0 && (
              <div>
                <p className="mb-2 text-center text-xs text-gray-400">
                  Ask questions about your specific secretome analysis results.
                </p>
                {suggestionsLoading && (
                  <p className="text-center text-xs text-gray-400">
                    Loading suggestions…
                  </p>
                )}
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="block w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs leading-relaxed text-gray-700 transition hover:border-blue-400 hover:bg-blue-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex flex-col ${
                  msg.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-blue-600 text-white"
                      : msg.error
                      ? "rounded-bl-sm border border-red-100 bg-red-50 text-red-800"
                      : "rounded-bl-sm border border-gray-100 bg-gray-50 text-gray-800"
                  }`}
                >
                  {msg.role === "assistant"
                    ? highlightGenes(msg.content)
                    : msg.content}
                </div>
                <p className="mt-0.5 px-1 text-[10px] text-gray-400">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                  {msg.tokens_used ? (
                    <span className="ml-2">{msg.tokens_used} tokens</span>
                  ) : null}
                </p>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex max-w-[60%] items-center gap-2 rounded-xl rounded-bl-sm border border-gray-100 bg-gray-50 px-3 py-2.5">
                <span className="flex gap-1">
                  {[0, 1, 2].map((n) => (
                    <span
                      key={n}
                      className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500"
                      style={{ animation: `chatBounce 1.2s ease-in-out ${n * 0.2}s infinite` }}
                    />
                  ))}
                </span>
                <span className="text-xs text-gray-400">Analyzing your secretome…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Token counter */}
          {totalTokens > 0 && (
            <div className="border-t border-gray-100 bg-gray-50 px-3 py-1 text-right text-[10px] text-gray-400">
              {totalTokens.toLocaleString()} total tokens this session
            </div>
          )}

          {/* Input */}
          <div className="border-t border-gray-100 bg-white p-3">
            {messages.length >= 18 && (
              <p className="mb-1.5 text-xs text-amber-600">
                ⚠️ Conversation limit approaching — clear to start fresh.
              </p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your secretome results…"
                disabled={loading}
                rows={2}
                maxLength={2000}
                className="flex-1 resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-blue-400 disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                className="h-[56px] rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                Send →
              </button>
            </div>
            <p className="mt-1 text-[10px] text-gray-400">
              Enter to send · Shift+Enter for new line · {input.length}/2000
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes chatBounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}
