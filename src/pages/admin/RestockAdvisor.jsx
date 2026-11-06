import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Send, PackageSearch, Loader2, RefreshCw } from 'lucide-react';
import MessageBubble from '@/components/restock/MessageBubble';
import { toast } from 'sonner';

const SUGGESTED_PROMPTS = [
  'Analyze all stock levels and suggest what to reorder now',
  'Which products are completely out of stock?',
  'Show me critical items with stock below 50% of threshold',
  'Estimate total cost to fully restock all low items',
  'Group low-stock items by category',
];

const UNAVAILABLE = {
  not_configured: {
    title: 'AI Restock Advisor is not configured',
    body: 'The AI features have not been set up for this store. Everything else in B12 Store Solution works normally without them.',
    hint: 'To enable it, add ANTHROPIC_API_KEY to the backend service variables on Railway. The advisor turns on automatically after the service redeploys.',
  },
  model_unavailable: {
    title: 'AI Restock Advisor is unavailable',
    body: 'An Anthropic API key is configured, but the selected AI model is not available to it.',
    hint: 'Check ANTHROPIC_API_KEY and ANTHROPIC_MODEL in the Railway variables. The rest of the app is not affected.',
  },
  unreachable: {
    title: 'AI Restock Advisor status unknown',
    body: 'The advisor status could not be loaded. Check your connection and refresh the page.',
    hint: null,
  },
};

function AdvisorUnavailable({ reason }) {
  const msg = UNAVAILABLE[reason] ?? UNAVAILABLE.not_configured;
  return (
    <div className="max-w-2xl mx-auto mt-8">
      <div className="bg-card border border-border rounded-xl p-6 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto">
          <PackageSearch className="w-7 h-7 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">{msg.title}</h1>
        <p className="text-sm text-muted-foreground">{msg.body}</p>
        {msg.hint && <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">{msg.hint}</p>}
      </div>
    </div>
  );
}

export default function RestockAdvisor() {
  // The conversation lives in the page, as before: a new session on load or "New Session".
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // The advisor is optional: it is off until ANTHROPIC_API_KEY is set on the backend.
  const [aiStatus, setAiStatus] = useState(null); // null while checking
  const initializing = aiStatus === null;
  const session = useRef(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.advisor.status()
      .then(setAiStatus)
      .catch(() => setAiStatus({ enabled: false, reason: 'unreachable' }));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initConversation = () => {
    session.current += 1; // drops any answer still in flight for the old session
    setMessages([]);
    setLoading(false);
  };

  const sendMessage = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    const mySession = session.current;
    const history = [...messages, { role: 'user', content: msg }];
    setInput('');
    setMessages(history);
    setLoading(true);
    try {
      // The API keeps no state: send the text history (the last 40 turns).
      const { message } = await api.advisor.chat(history.filter((m) => m.content).slice(-40).map(({ role, content }) => ({ role, content })));
      if (session.current === mySession) setMessages((prev) => [...prev, message]);
    } catch (err) {
      if (session.current === mySession) toast.error(err.message || 'The advisor could not answer');
    } finally {
      if (session.current === mySession) setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const isThinking = loading;

  if (aiStatus && !aiStatus.enabled) {
    return <AdvisorUnavailable reason={aiStatus.reason} />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <PackageSearch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Restock Advisor</h1>
            <p className="text-xs text-muted-foreground">AI-powered inventory analysis & reorder suggestions</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={initConversation} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          New Session
        </Button>
      </div>

      {/* Chat area */}
      <div className="flex-1 bg-card border border-border rounded-xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {initializing ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Initializing advisor…</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-6">
              <div>
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <PackageSearch className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">Ready to analyze your inventory</h3>
                <p className="text-sm text-muted-foreground mt-1">Ask me to check stock levels, suggest reorders, or estimate costs.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="text-left px-3 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted text-xs text-foreground transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}
              {(loading || isThinking) && (
                <div className="flex gap-3 justify-start">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm">🤖</span>
                  </div>
                  <div className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Analyzing inventory…</span>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 shrink-0">
          {messages.length > 0 && (
            <div className="flex gap-2 mb-2 overflow-x-auto pb-1 scrollbar-hide">
              {SUGGESTED_PROMPTS.slice(0, 3).map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about stock levels, reorder quantities, costs…"
              rows={1}
              disabled={loading || initializing}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 min-h-[38px] max-h-32"
              style={{ height: 'auto' }}
              onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading || initializing}
              size="icon"
              className="shrink-0 rounded-xl"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}