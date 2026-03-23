
-- Replace process_automations with smart contextual notifications
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
  smart_title TEXT;
  smart_message TEXT;
  order_amount NUMERIC;
  customer_name TEXT;
  days_since_last_order INTEGER;
  customer_count INTEGER;
  week_ago TIMESTAMPTZ;
BEGIN
  week_ago := now() - interval '7 days';
  
  IF TG_TABLE_NAME = 'customers' THEN
    IF TG_OP = 'INSERT' THEN
      trigger_type := 'customer_created';
    ELSE
      RETURN NEW;
    END IF;
    org_id := NEW.organization_id;
    trigger_user_id := NULL;
    
    -- Count recent customers for context
    SELECT count(*) INTO customer_count FROM public.customers 
    WHERE organization_id = org_id AND created_at >= week_ago;
    
    entity_data := jsonb_build_object(
      'customer_id', NEW.id,
      'customer_name', NEW.name,
      'customer_email', NEW.email,
      'new_customers_this_week', customer_count
    );

  ELSIF TG_TABLE_NAME = 'orders' THEN
    org_id := NEW.organization_id;
    trigger_user_id := NULL;
    order_amount := NEW.amount;
    
    -- Get customer name
    IF NEW.customer_id IS NOT NULL THEN
      SELECT name INTO customer_name FROM public.customers WHERE id = NEW.customer_id;
    END IF;
    
    entity_data := jsonb_build_object(
      'order_id', NEW.id,
      'amount', NEW.amount,
      'status', NEW.status,
      'customer_id', NEW.customer_id,
      'customer_name', COALESCE(customer_name, 'Unknown')
    );

    IF TG_OP = 'INSERT' THEN
      trigger_type := 'order_created';
    ELSIF TG_OP = 'UPDATE' THEN
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

  FOR rule IN
    SELECT * FROM public.automation_rules
    WHERE organization_id = org_id
      AND trigger = trigger_type
      AND is_active = true
  LOOP
    condition_met := true;

    IF rule.condition IS NOT NULL AND rule.condition != '{}'::jsonb THEN
      IF rule.condition ? 'min_amount' THEN
        IF (entity_data->>'amount')::numeric < (rule.condition->>'min_amount')::numeric THEN
          condition_met := false;
        END IF;
      END IF;
      IF rule.condition ? 'status' THEN
        IF entity_data->>'status' != rule.condition->>'status' THEN
          condition_met := false;
        END IF;
      END IF;
    END IF;

    IF NOT condition_met THEN
      CONTINUE;
    END IF;

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
      -- Generate smart contextual notification
      IF trigger_type = 'customer_created' THEN
        smart_title := '🎉 New customer: ' || NEW.name;
        IF customer_count > 3 THEN
          smart_message := 'Great momentum! ' || customer_count || ' new customers this week. Keep the growth going!';
        ELSIF customer_count = 1 THEN
          smart_message := 'First new customer this week. Consider running a promotion to attract more.';
        ELSE
          smart_message := customer_count || ' new customers this week. Reach out to build relationships early.';
        END IF;

      ELSIF trigger_type = 'order_created' THEN
        IF order_amount >= 10000 THEN
          smart_title := '💰 High-value order: $' || order_amount::text;
          smart_message := 'High-value order from ' || COALESCE(customer_name, 'a customer') || ' ($' || order_amount::text || '). Prioritize fulfillment!';
        ELSIF order_amount >= 5000 THEN
          smart_title := '📦 New order: $' || order_amount::text;
          smart_message := 'Solid order from ' || COALESCE(customer_name, 'a customer') || '. Consider upselling related products.';
        ELSE
          smart_title := '📦 New order: $' || order_amount::text;
          smart_message := 'Order from ' || COALESCE(customer_name, 'a customer') || ' for $' || order_amount::text || '.';
        END IF;

      ELSIF trigger_type = 'order_completed' THEN
        smart_title := '✅ Order completed: $' || order_amount::text;
        smart_message := 'Order for ' || COALESCE(customer_name, 'a customer') || ' completed ($' || order_amount::text || '). Great job! Follow up for repeat business.';

      ELSE
        smart_title := COALESCE(action_value, 'Automation triggered');
        smart_message := 'Rule "' || rule.name || '" fired.';
      END IF;

      INSERT INTO public.notifications (organization_id, user_id, title, message)
      SELECT org_id, om.user_id, smart_title, smart_message
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
