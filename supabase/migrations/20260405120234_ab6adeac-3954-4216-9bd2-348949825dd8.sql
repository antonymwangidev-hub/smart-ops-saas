
-- Create user_preferences table
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  ai_recommendations BOOLEAN NOT NULL DEFAULT true,
  auto_escalate BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences" ON public.user_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences" ON public.user_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences" ON public.user_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- Create triggers for automation execution on orders, customers, and tasks tables
-- Drop existing triggers first if they exist
DROP TRIGGER IF EXISTS automation_trigger_orders ON public.orders;
DROP TRIGGER IF EXISTS automation_trigger_customers ON public.customers;

CREATE TRIGGER automation_trigger_orders
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.process_automations();

CREATE TRIGGER automation_trigger_customers
  AFTER INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.process_automations();

-- Enable realtime for mpesa_payments
ALTER PUBLICATION supabase_realtime ADD TABLE public.mpesa_payments;
