import React, { useEffect, useRef, useState } from "react";

const API_URL = "http://localhost:8000/chat";

function App() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi, I’m your Consumer Product Intelligence Analyst. Ask me about any food product, brand, ingredients list, or nutrition grade and I’ll help you understand it.",
      tools_used: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setError("");
    const userMessage = { role: "user", content: trimmed };

    const conversationHistory = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          conversation_history: conversationHistory,
        }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();
      const toolsUsed = Array.isArray(data.tools_used) ? data.tools_used : [];

      const assistantMessage = {
        role: "assistant",
        content: data.response ?? "",
        tools_used: toolsUsed,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setError("Something went wrong talking to the agent. Please try again.");
      const assistantErrorMessage = {
        role: "assistant",
        content:
          "I hit an error while querying the backend. Please check that the agent server is running on http://localhost:8000 and try again.",
        tools_used: [],
        isError: true,
      };
      setMessages((prev) => [...prev, assistantErrorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="app-shell">
      <div className="chat-card">
        <header className="chat-header">
          <div className="chat-title">
            <span className="chat-title-main">Product Intelligence Agent</span>
            <span className="chat-title-sub">
              Ask about food products, brands, ingredients, and nutrition data.
            </span>
          </div>
          <div className="status-pill">
            <span className="status-dot" />
            <span>Connected</span>
          </div>
        </header>

        <main className="chat-body">
          <div className="messages-scroll" ref={scrollRef}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`msg-row ${msg.role === "user" ? "user" : "agent"}`}
              >
                <div
                  className={`msg-bubble ${
                    msg.role === "user" ? "user" : "agent"
                  }`}
                >
                  {msg.content}
                  {msg.role === "assistant" && (
                    <div className="msg-meta">
                      {msg.isError && (
                        <span style={{ color: "var(--danger)" }}>
                          Backend error
                        </span>
                      )}
                      {Array.isArray(msg.tools_used) &&
                        msg.tools_used.length > 0 && (
                          <>
                            <span>Tools:</span>
                            {msg.tools_used.map((tool) => (
                              <span key={tool} className="tool-tag">
                                {tool}
                              </span>
                            ))}
                          </>
                        )}
                      {Array.isArray(msg.tools_used) &&
                        msg.tools_used.length === 0 &&
                        !msg.isError && <span>Tools: none</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="msg-row agent">
                <div className="msg-bubble agent">
                  Thinking about your question…
                  <div className="msg-meta">
                    <span>Consulting product tools</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            {error && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--danger)",
                  padding: "0 4px 6px",
                }}
              >
                {error}
              </div>
            )}
            {loading && (
              <div className="loading-indicator">
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span>Waiting for agent response…</span>
              </div>
            )}
          </div>
        </main>

        <footer className="input-bar">
          <div className="input-wrapper">
            <input
              className="input-field"
              type="text"
              placeholder="Ask about a product, brand, ingredients, or nutrition grade..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            className="send-button"
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            <span>Send</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

export default App;

