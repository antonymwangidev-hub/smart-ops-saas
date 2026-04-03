
-- Add new columns to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS estimated_hours numeric DEFAULT null,
ADD COLUMN IF NOT EXISTS category text DEFAULT null,
ADD COLUMN IF NOT EXISTS due_date timestamp with time zone DEFAULT null,
ADD COLUMN IF NOT EXISTS ai_recommended boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ai_confidence numeric DEFAULT null;

-- Create task_comments table
CREATE TABLE public.task_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view task comments" ON public.task_comments
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Members can create task comments" ON public.task_comments
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())) AND user_id = auth.uid());

CREATE POLICY "Users can delete own comments" ON public.task_comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Create user_presence table
CREATE TABLE public.user_presence (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'online',
  last_seen timestamp with time zone NOT NULL DEFAULT now(),
  current_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL DEFAULT null
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view presence" ON public.user_presence
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Users can upsert own presence" ON public.user_presence
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own presence" ON public.user_presence
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for task_comments, user_presence, and tasks
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
