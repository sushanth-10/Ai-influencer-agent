import { useEffect, useRef, useState } from 'react';
import { sendChatMessage } from './api/n8n';
import type { CampaignRequest } from './api/types';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  memories?: string[];
  suggestions?: string[];
};

const STORAGE_KEY = 'campaignmind:chat-history';
const CONVERSATION_KEY = 'campaignmind:chat-conversation';

const starterSuggestions = [
  'Which influencers fit my current campaign?',
  'What have we learned from previous campaigns?',
  'Why are these creators a good match?',
];

function getConversationId() {
  const stored = sessionStorage.getItem(CONVERSATION_KEY);
  if (stored) return stored;

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `chat_${Date.now()}`;

  sessionStorage.setItem(CONVERSATION_KEY, id);
  return id;
}

function loadHistory(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getActiveCampaign(): CampaignRequest | null {
  try {
    const activeId = localStorage.getItem('campaignmind:active-campaign');
    const raw = localStorage.getItem('campaignmind:campaigns');
    if (!raw) return null;

    const campaigns = JSON.parse(raw);
    if (!Array.isArray(campaigns) || campaigns.length === 0) return null;

    const active =
      campaigns.find((item) => item?.id === activeId) ?? campaigns[0];

    return active?.form ?? null;
  } catch {
    return null;
  }
}

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function submitMessage(text: string) {
    const message = text.trim();
    if (!message || loading) return;

    setInput('');
    setError('');

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text: message,
    };

    setMessages((current) => [...current, userMessage]);
    setLoading(true);

    try {
      const response = await sendChatMessage(
        message,
        getConversationId(),
        getActiveCampaign()
      );

      setMessages((current) => [
        ...current,
        {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          text: response.reply,
          memories: response.memories,
          suggestions: response.suggestions,
        },
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message.replace(/CampaignMind/gi, 'ERAYA')
          : 'The assistant could not respond right now.'
      );
    } finally {
      setLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setError('');
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(CONVERSATION_KEY);
  }

  return (
    <>
      {open && (
        <section
          aria-label="ERAYA assistant"
          className="fixed bottom-24 right-5 z-[70] flex h-[min(680px,calc(100vh-120px))] w-[min(410px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-[#dce6d9] bg-[#fbfcfa] shadow-[0_24px_70px_rgba(23,60,50,0.22)]"
        >
          <header className="flex items-center justify-between bg-[#173c32] px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <img src="/assets/eraya-logo.png" alt="ERAYA" className="h-10 w-10 rounded-2xl object-cover" />
              <div>
                <p className="text-sm font-bold">ERAYA assistant</p>
                <p className="text-[11px] text-white/65">
                  Memory-aware campaign assistant
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearChat}
                className="rounded-lg px-2 py-1.5 text-[11px] text-white/70 hover:bg-white/10 hover:text-white"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="grid h-8 w-8 place-items-center rounded-lg text-lg text-white/80 hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            {messages.length === 0 ? (
              <div className="flex min-h-full flex-col justify-center">
                <div className="mx-auto max-w-[310px] text-center">
                  <h3 className="font-display text-lg font-semibold text-[#173c32]">
                    Ask your campaign copilot
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-[#75827b]">
                    Ask about creators, campaign strategy, or what ERAYA
                    has learned from previous campaigns.
                  </p>

                  <div className="mt-5 space-y-2 text-left">
                    {starterSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => submitMessage(suggestion)}
                        className="w-full rounded-2xl border border-[#dce6d9] bg-white px-3 py-3 text-left text-xs font-semibold text-[#38594b] transition hover:border-[#b8ce8d] hover:bg-[#f6faef]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                        message.role === 'user'
                          ? 'rounded-br-md bg-[#173c32] text-white'
                          : 'rounded-bl-md border border-[#e1e8df] bg-white text-[#30473d]'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.text}</p>

                      {message.memories && message.memories.length > 0 && (
                        <div className="mt-3 rounded-xl bg-[#f4f8ef] p-3">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#60766b]">
                            Hindsight recalled
                          </p>
                          <ul className="space-y-1 text-[11px] leading-4 text-[#53665c]">
                            {message.memories.slice(0, 3).map((memory, index) => (
                              <li key={`${memory}-${index}`}>• {memory}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {message.suggestions && message.suggestions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.suggestions.slice(0, 3).map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              onClick={() => submitMessage(suggestion)}
                              className="rounded-full border border-[#dce6d9] bg-[#fbfcfa] px-3 py-1 text-[11px] font-semibold text-[#38594b] hover:border-[#b8ce8d] hover:bg-[#f6faef]"
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-bl-md border border-[#e1e8df] bg-white px-4 py-3 text-xs text-[#728079]">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7d9d52]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7d9d52] [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7d9d52] [animation-delay:300ms]" />
                        Thinking with campaign memory…
                      </span>
                    </div>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-[#f0dddd] bg-[#fff7f7] px-4 py-2 text-[11px] text-[#9a4b4b]">
              {error}
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitMessage(input);
            }}
            className="border-t border-[#e4eae1] bg-white p-3"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-[#d7e1d3] bg-[#fbfcfa] p-2 focus-within:border-[#9dbb76]">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submitMessage(input);
                  }
                }}
                rows={1}
                placeholder="Ask ERAYA anything…"
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-[#29463b] outline-none placeholder:text-[#9aa59f]"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#173c32] text-lg text-white transition hover:bg-[#245646] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                ↑
              </button>
            </div>
            <p className="mt-2 px-1 text-[9px] text-[#a0aaa4]">
              Enter to send · Shift+Enter for a new line
            </p>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close ERAYA assistant' : 'Open ERAYA assistant'}
        className="fixed bottom-5 right-5 z-[71] grid h-14 w-14 place-items-center rounded-full bg-[#173c32] text-xl text-[#d5ed78] shadow-[0_12px_30px_rgba(23,60,50,0.25)] transition hover:-translate-y-0.5 hover:bg-[#245646]"
      >
        {open ? '×' : <img src="/assets/eraya-logo.png" alt="ERAYA" className="h-10 w-10 rounded-full object-cover" />}
      </button>
    </>
  );
}
