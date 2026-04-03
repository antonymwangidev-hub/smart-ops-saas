import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  display_name?: string;
}

interface RealtimeCommentThreadProps {
  taskId: string;
  organizationId: string;
}

export function RealtimeCommentThread({ taskId, organizationId }: RealtimeCommentThreadProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchComments = async () => {
    const { data } = await supabase
      .from("task_comments" as any)
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true });

    if (data) {
      const userIds = [...new Set((data as any[]).map((c: any) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      const enriched = (data as any[]).map((c: any) => ({
        ...c,
        display_name: profiles?.find((p) => p.user_id === c.user_id)?.display_name || "Unknown",
      }));
      setComments(enriched);
    }
  };

  useEffect(() => {
    fetchComments();
    const channel = supabase
      .channel(`comments-${taskId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "task_comments",
        filter: `task_id=eq.${taskId}`,
      }, () => fetchComments())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [taskId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;
    setSubmitting(true);
    await supabase.from("task_comments" as any).insert({
      task_id: taskId,
      organization_id: organizationId,
      user_id: user.id,
      content: content.trim(),
    } as any);
    setContent("");
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("task_comments" as any).delete().eq("id", id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 max-h-60 pr-1">
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No comments yet</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className={`flex gap-2 group ${c.user_id === user?.id ? "flex-row-reverse" : ""}`}>
            <div className={`rounded-xl px-3 py-2 text-xs max-w-[80%] ${
              c.user_id === user?.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
            }`}>
              <div className="font-medium mb-0.5">{c.display_name}</div>
              <div>{c.content}</div>
              <div className="text-[10px] opacity-70 mt-1">
                {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
              </div>
            </div>
            {c.user_id === user?.id && (
              <button
                onClick={() => handleDelete(c.id)}
                className="opacity-0 group-hover:opacity-100 self-center transition-opacity"
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 mt-3">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a comment..."
          className="min-h-[36px] h-9 text-xs resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
          }}
        />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={submitting || !content.trim()}>
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        </Button>
      </form>
    </div>
  );
}
