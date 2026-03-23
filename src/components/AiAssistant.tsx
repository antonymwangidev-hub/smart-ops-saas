import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, Bot, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "Show my top customers",
  "How many orders this week?",
  "What is my total revenue?",
  "Which tasks are pending?",
];

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { currentOrg } = useOrg();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const send = async (text: string) => {
    if (!text.trim() || !currentOrg || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput("");
    setLoading(true);

    let assistantContent = "";

    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ messages: allMessages, orgId: currentOrg.id }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Request failed");
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const upsert = (chunk: string) => {
        assistantContent += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantContent } : m));
          }
          return [...prev, { role: "assistant", content: assistantContent }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nlIdx: number;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsert(content);
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry, I encountered an error: ${e.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-20 right-6 z-50 w-[400px] max-h-[600px] rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-border bg-primary/5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm text-foreground">SmartOps AI</h3>
                <p className="text-xs text-muted-foreground">Ask about your business</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 max-h-[420px]" ref={scrollRef}>
              <div className="p-4 space-y-4">
                {messages.length === 0 && (
                  <div className="text-center py-6 space-y-4">
                    <Bot className="h-10 w-10 text-primary mx-auto opacity-50" />
                    <p className="text-sm text-muted-foreground">Ask me anything about your business data</p>
                    <div className="grid grid-cols-1 gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          className="text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                    {m.role === "assistant" && (
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot className="h-3 w-3 text-primary" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {m.content}
                    </div>
                    {m.role === "user" && (
                      <div className="h-6 w-6 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0 mt-1">
                        <User className="h-3 w-3 text-secondary" />
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-2 items-center">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-3 w-3 text-primary" />
                    </div>
                    <div className="bg-muted rounded-xl px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-3 border-t border-border">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex gap-2"
              >
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your business..."
                  className="flex-1 text-sm"
                  disabled={loading}
                />
                <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </motion.button>
    </>
  );
}
