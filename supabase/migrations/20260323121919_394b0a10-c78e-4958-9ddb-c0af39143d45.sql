
-- Automation engine: processes rules when triggers fire
CREATE OR REPLACE FUNCTION public.process_automations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule RECORD;
  trigger_type TEXT;
  org_id UUID;
  trigger_user_id UUID;
  entity_data JSONB;
  action_type TEXT;
  action_value TEXT;
  condition_met BOOLEAN;
BEGIN
  -- Determine trigger type and org based on the source table
  IF TG_TABLE_NAME = 'customers' THEN
    IF TG_OP = 'INSERT' THEN
      trigger_type := 'customer_created';
    ELSE
      RETURN NEW;
    END IF;
    org_id := NEW.organization_id;
    trigger_user_id := NULL;
    entity_data := jsonb_build_object(
      'customer_id', NEW.id,
      'customer_name', NEW.name,
      'customer_email', NEW.email
    );

  ELSIF TG_TABLE_NAME = 'orders' THEN
    org_id := NEW.organization_id;
    trigger_user_id := NULL;
    entity_data := jsonb_build_object(
      'order_id', NEW.id,
      'amount', NEW.amount,
      'status', NEW.status,
      'customer_id', NEW.customer_id
    );

    IF TG_OP = 'INSERT' THEN
      trigger_type := 'order_created';
    ELSIF TG_OP = 'UPDATE' THEN
      -- Check if status changed to completed
      IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
        trigger_type := 'order_completed';
      ELSE
        RETURN NEW;
      END IF;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Find matching active rules for this org and trigger
  FOR rule IN
    SELECT * FROM public.automation_rules
    WHERE organization_id = org_id
      AND trigger = trigger_type
      AND is_active = true
  LOOP
    -- Evaluate conditions (if any)
    condition_met := true;

    IF rule.condition IS NOT NULL AND rule.condition != '{}'::jsonb THEN
      -- Check amount > X condition
      IF rule.condition ? 'min_amount' THEN
        IF (entity_data->>'amount')::numeric < (rule.condition->>'min_amount')::numeric THEN
          condition_met := false;
        END IF;
      END IF;

      -- Check status matches condition
      IF rule.condition ? 'status' THEN
        IF entity_data->>'status' != rule.condition->>'status' THEN
          condition_met := false;
        END IF;
      END IF;
    END IF;

    IF NOT condition_met THEN
      CONTINUE;
    END IF;

    -- Execute action
    action_type := rule.action->>'type';
    action_value := rule.action->>'value';

    IF action_type = 'create_task' THEN
      INSERT INTO public.tasks (organization_id, title, description, status)
      VALUES (
        org_id,
        COALESCE(action_value, 'Auto-generated task'),
        'Created by automation rule: ' || rule.name || '. Trigger: ' || trigger_type,
        'todo'
      );

    ELSIF action_type = 'send_notification' THEN
      -- Send notification to all org members
      INSERT INTO public.notifications (organization_id, user_id, title, message)
      SELECT
        org_id,
        om.user_id,
        COALESCE(action_value, 'Automation triggered'),
        'Rule "' || rule.name || '" fired on ' || trigger_type || '. ' || entity_data::text
      FROM public.organization_members om
      WHERE om.organization_id = org_id;

    ELSIF action_type = 'log_event' THEN
      INSERT INTO public.activity_logs (organization_id, user_id, action, metadata)
      VALUES (
        org_id,
        trigger_user_id,
        'automation_executed',
        jsonb_build_object(
          'rule_id', rule.id,
          'rule_name', rule.name,
          'trigger', trigger_type,
          'action', rule.action,
          'entity_data', entity_data
        )
      );
    END IF;

    -- Always log the automation execution
    INSERT INTO public.activity_logs (organization_id, user_id, action, metadata)
    VALUES (
      org_id,
      trigger_user_id,
      'automation_rule_fired',
      jsonb_build_object(
        'rule_id', rule.id,
        'rule_name', rule.name,
        'trigger', trigger_type,
        'action_type', action_type
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger on customers INSERT
CREATE TRIGGER automation_on_customer_created
  AFTER INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.process_automations();

-- Trigger on orders INSERT
CREATE TRIGGER automation_on_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.process_automations();

-- Trigger on orders UPDATE (for order_completed)
CREATE TRIGGER automation_on_order_updated
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.process_automations();
