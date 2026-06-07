import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/contexts/OrgContext";

export function usePermissions() {
  const { user } = useAuth();
  const { currentOrg } = useOrg();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user || !currentOrg) {
        setPermissions(new Set());
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.rpc("user_permissions", {
        _user_id: user.id,
        _org_id: currentOrg.id,
      });
      if (cancelled) return;
      if (error || !data) {
        setPermissions(new Set());
      } else {
        setPermissions(new Set((data as any[]).map((r) => (typeof r === "string" ? r : r.permission_key || r))));
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [user?.id, currentOrg?.id]);

  const has = (key: string) => permissions.has(key);
  const hasAny = (...keys: string[]) => keys.some((k) => permissions.has(k));

  return { permissions, has, hasAny, loading };
}
