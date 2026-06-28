import {
  createContext, useContext, useEffect, useState, useCallback, ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface Organization {
  id: string;
  name: string;
  role: string;
}

interface OrgContextType {
  currentOrg: Organization | null;
  organizations: Organization[];
  loading: boolean;
  error: string | null;
  setCurrentOrg: (org: Organization) => void;
  refreshOrgs: () => Promise<void>;
}

const STORAGE_KEY = "smartops-selected-org-id";

const OrgContext = createContext<OrgContextType>({
  currentOrg: null,
  organizations: [],
  loading: true,
  error: null,
  setCurrentOrg: () => {},
  refreshOrgs: async () => {},
});

export const useOrg = () => useContext(OrgContext);

/**
 * OrgProvider — two fixes over the original.
 *
 * FIX 1 — Error handling
 * ──────────────────────
 * The original silently swallowed Supabase errors. If the query failed,
 * `data` was null, loading was set to false, and the user saw a blank
 * screen with no way to know why (and no retry path).
 * Now we surface errors via the `error` field so consumers can show a
 * meaningful message and a retry button.
 *
 * FIX 2 — Persist selected org across page refreshes
 * ──────────────────────────────────────────────────
 * Multi-org users lost their selected org on every refresh because state
 * is ephemeral. Now we persist the selection to localStorage and restore
 * it on mount. Single-org users are unaffected.
 */
export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentOrg, _setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setCurrentOrg = useCallback((org: Organization) => {
    _setCurrentOrg(org);
    // Persist selection so a page refresh remembers it
    localStorage.setItem(STORAGE_KEY, org.id);
  }, []);

  const fetchOrgs = useCallback(async () => {
    if (!user) {
      setOrganizations([]);
      _setCurrentOrg(null);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setError(null);
      const { data, error: queryError } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(id, name)")
        .eq("user_id", user.id);

      if (queryError) throw queryError;

      const orgs: Organization[] = (data ?? []).map((m: any) => ({
        id: m.organizations.id,
        name: m.organizations.name,
        role: m.role,
      }));

      setOrganizations(orgs);

      if (orgs.length > 0) {
        // Restore previously selected org, fall back to first
        const savedId = localStorage.getItem(STORAGE_KEY);
        const savedOrg = savedId ? orgs.find((o) => o.id === savedId) : null;
        _setCurrentOrg((prev) => {
          // Don't overwrite if already set (e.g. user switched org mid-session)
          if (prev && orgs.find((o) => o.id === prev.id)) return prev;
          return savedOrg ?? orgs[0];
        });
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to load your organisations. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  return (
    <OrgContext.Provider
      value={{
        currentOrg,
        organizations,
        loading,
        error,
        setCurrentOrg,
        refreshOrgs: fetchOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}
