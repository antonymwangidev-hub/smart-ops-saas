import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/contexts/OrgContext";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Plus, Loader2, CheckCircle2, Circle, Clock, Sparkles, MessageSquare, Activity as ActivityIcon,
  Users, ArrowUp, ArrowRight, ArrowDown, GripVertical, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AIRecommendationCard, type AIRecommendation } from "@/components/AIRecommendationCard";
import { RealtimeCommentThread } from "@/components/RealtimeCommentThread";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { usePresence } from "@/hooks/usePresence";
import { useAIRecommendations } from "@/hooks/useAIRecommendations";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

type TaskStatus = "todo" | "in_progress" | "done";
const PAGE_SIZE = 50;

const statusIcons: Record<TaskStatus, React.ReactNode> = {
  todo: <Circle className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-amber-500" />,
  done: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
};

const priorityIcons: Record<string, React.ReactNode> = {
  high: <ArrowUp className="h-3 w-3 text-destructive" />,
  medium: <ArrowRight className="h-3 w-3 text-amber-500" />,
  low: <ArrowDown className="h-3 w-3 text-muted-foreground" />,
};

export default function Tasks() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", status: "todo" as TaskStatus, priority: "medium", due_date: "" });
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [page, setPage] = useState(0);
  const { onlineUsers, onlineCount, updatePresence } = usePresence();
  const { recommendation, loading: aiLoading, getRecommendation, dismiss, setRecommendation } = useAIRecommendations();

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["tasks", currentOrg?.id, page],
    queryFn: async () => {
      if (!currentOrg) return { tasks: [], count: 0 };
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from("tasks")
        .select("*", { count: "exact" })
        .eq("organization_id", currentOrg.id)
        .order("created_at", { ascending: false })
        .range(from, to);
      return { tasks: data || [], count: count || 0 };
    },
    enabled: !!currentOrg,
  });

  const [localTasks, setLocalTasks] = useState<any[]>([]);
  useEffect(() => {
    if (tasksData?.tasks) setLocalTasks(tasksData.tasks);
  }, [tasksData?.tasks]);

  const totalCount = tasksData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  useEffect(() => {
    if (!currentOrg) return;
    const channel = supabase.channel("tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `organization_id=eq.${currentOrg.id}` }, () =>
        queryClient.invalidateQueries({ queryKey: ["tasks", currentOrg.id] })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentOrg, queryClient]);

  // Trigger AI when title has 5+ chars
  useEffect(() => {
    if (form.title.length >= 5 && dialogOpen && currentOrg) {
      const timeout = setTimeout(() => {
        getRecommendation(form.title, form.description, currentOrg.id);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [form.title, form.description, dialogOpen]);

  const handleAcceptAI = (rec: AIRecommendation) => {
    setForm(prev => ({ ...prev, priority: rec.priority }));
    toast({ title: "AI recommendation applied" });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrg) throw new Error("No org");
      const insertData: any = {
        organization_id: currentOrg.id, title: form.title, description: form.description || null,
        status: form.status, priority: form.priority, due_date: form.due_date || null,
      };
      if (recommendation) {
        insertData.ai_recommended = true;
        insertData.ai_confidence = recommendation.confidence;
        insertData.estimated_hours = recommendation.estimated_hours;
        insertData.category = recommendation.category;
        if (recommendation.suggested_assignee_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recommendation.suggested_assignee_id)) {
          insertData.assigned_to = recommendation.suggested_assignee_id;
        }
      }
      const { error } = await supabase.from("tasks").insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      setDialogOpen(false);
      setForm({ title: "", description: "", status: "todo", priority: "medium", due_date: "" });
      dismiss();
      queryClient.invalidateQueries({ queryKey: ["tasks", currentOrg?.id] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      await supabase.from("tasks").update({ status }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks", currentOrg?.id] }),
  });

  const onDragEnd = useCallback(async (result: DropResult) => {
    const { draggableId, destination } = result;
    if (!destination) return;
    const newStatus = destination.droppableId as TaskStatus;
    setLocalTasks(prev => prev.map(t => t.id === draggableId ? { ...t, status: newStatus } : t));
    await supabase.from("tasks").update({ status: newStatus }).eq("id", draggableId);
    queryClient.invalidateQueries({ queryKey: ["tasks", currentOrg?.id] });
  }, [currentOrg, queryClient]);

  const openTaskDetail = (task: any) => {
    setSelectedTask(task);
    setSheetOpen(true);
    updatePresence(task.id);
  };

  const closeTaskDetail = () => {
    setSheetOpen(false);
    setSelectedTask(null);
    updatePresence(null);
  };

  const editingUsers = selectedTask
    ? onlineUsers.filter(u => u.current_task_id === selectedTask.id && u.user_id !== user?.id)
    : [];

  const columns: { status: TaskStatus; label: string }[] = [
    { status: "todo", label: "To Do" },
    { status: "in_progress", label: "In Progress" },
    { status: "done", label: "Done" },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
            <p className="text-muted-foreground">Manage your team's tasks ({totalCount} total)</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>{onlineCount} online</span>
              <div className="flex -space-x-1">
                {onlineUsers.filter(u => u.status === "online").slice(0, 5).map(u => (
                  <PresenceIndicator key={u.user_id} status="online" name={u.display_name} />
                ))}
              </div>
            </div>

            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) dismiss(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Task</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Task</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">🔴 High</SelectItem>
                          <SelectItem value="medium">🟡 Medium</SelectItem>
                          <SelectItem value="low">🟢 Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Due Date</Label>
                      <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                    </div>
                  </div>

                  <AIRecommendationCard
                    recommendation={recommendation}
                    loading={aiLoading}
                    onAccept={handleAcceptAI}
                    onDismiss={dismiss}
                  />

                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Task
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {columns.map((col) => (
                <Card key={col.status}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {statusIcons[col.status]}
                      {col.label}
                      <Badge variant="secondary" className="ml-auto">{localTasks.filter(t => t.status === col.status).length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <Droppable droppableId={col.status}>
                    {(provided, snapshot) => (
                      <CardContent
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`space-y-2 min-h-[80px] transition-colors ${snapshot.isDraggingOver ? "bg-primary/5 rounded-b-lg" : ""}`}
                      >
                        {localTasks.filter(t => t.status === col.status).map((task, index) => {
                          const taskOnlineUsers = onlineUsers.filter(u => u.current_task_id === task.id);
                          return (
                            <Draggable key={task.id} draggableId={task.id} index={index}>
                              {(provided, snapshot) => (
                                <Card
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  className={`p-3 cursor-pointer hover:shadow-md transition-shadow ${snapshot.isDragging ? "shadow-lg ring-2 ring-primary/30 rotate-1" : ""}`}
                                  onClick={() => openTaskDetail(task)}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-1.5 shrink-0" {...provided.dragHandleProps}>
                                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        {priorityIcons[task.priority || "medium"]}
                                        <span className="font-medium text-sm truncate">{task.title}</span>
                                      </div>
                                      {task.description && (
                                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {task.ai_recommended && (
                                        <Badge variant="outline" className="text-[10px] px-1 border-primary/30 text-primary">
                                          <Sparkles className="h-2.5 w-2.5 mr-0.5" />AI
                                        </Badge>
                                      )}
                                      {taskOnlineUsers.map(u => (
                                        <PresenceIndicator key={u.user_id} status="online" name={u.display_name} />
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                    {task.category && (
                                      <Badge variant="secondary" className="text-[10px]">{task.category}</Badge>
                                    )}
                                    {task.estimated_hours && (
                                      <span className="text-[10px] text-muted-foreground">{task.estimated_hours}h</span>
                                    )}
                                  </div>
                                </Card>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </CardContent>
                    )}
                  </Droppable>
                </Card>
              ))}
            </div>
          </DragDropContext>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ActivityIcon className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed />
          </CardContent>
        </Card>
      </div>

      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) closeTaskDetail(); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedTask && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {priorityIcons[selectedTask.priority || "medium"]}
                  {selectedTask.title}
                  {selectedTask.ai_recommended && (
                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                      <Sparkles className="h-2.5 w-2.5 mr-0.5" />AI
                    </Badge>
                  )}
                </SheetTitle>
                {editingUsers.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-500">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {editingUsers.map(u => u.display_name).join(", ")} editing…
                  </div>
                )}
              </SheetHeader>

              {selectedTask.description && (
                <p className="text-sm text-muted-foreground">{selectedTask.description}</p>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select
                    value={selectedTask.status}
                    onValueChange={(v) => {
                      updateStatusMutation.mutate({ id: selectedTask.id, status: v as TaskStatus });
                      setSelectedTask({ ...selectedTask, status: v });
                    }}
                  >
                    <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  <div className="flex items-center gap-1.5 mt-2">
                    {priorityIcons[selectedTask.priority || "medium"]}
                    <span className="capitalize">{selectedTask.priority || "medium"}</span>
                  </div>
                </div>
                {selectedTask.estimated_hours && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Estimated Hours</Label>
                    <p className="mt-1">{selectedTask.estimated_hours}h</p>
                  </div>
                )}
                {selectedTask.category && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Badge variant="secondary" className="mt-1">{selectedTask.category}</Badge>
                  </div>
                )}
                {selectedTask.ai_confidence && (
                  <div>
                    <Label className="text-xs text-muted-foreground">AI Confidence</Label>
                    <p className="mt-1">{Math.round(selectedTask.ai_confidence * 100)}%</p>
                  </div>
                )}
              </div>

              <Tabs defaultValue="comments">
                <TabsList className="w-full">
                  <TabsTrigger value="comments" className="flex-1">
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" />Comments
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="flex-1">
                    <ActivityIcon className="h-3.5 w-3.5 mr-1.5" />Activity
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="comments" className="mt-4">
                  {currentOrg && (
                    <RealtimeCommentThread taskId={selectedTask.id} organizationId={currentOrg.id} />
                  )}
                </TabsContent>
                <TabsContent value="activity" className="mt-4">
                  <ActivityFeed />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
