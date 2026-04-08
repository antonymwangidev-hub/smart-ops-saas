
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'mpesa_payments'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.mpesa_payments;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.task_comments;
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.user_presence;
  END IF;
END $$;
