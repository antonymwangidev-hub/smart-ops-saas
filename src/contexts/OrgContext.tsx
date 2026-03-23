import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
  setCurrentOrg: (org: Organization) => void;
  refreshOrgs: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType>({
  currentOrg: null,
  organizations: [],
  loading: true,
  setCurrentOrg: () => {},
  refreshOrgs: async () => {},
});

export const useOrg = () => useContext(OrgContext);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = async () => {
    if (!user) {
      setOrganizations([]);
      setCurrentOrg(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("organization_members")
      .select("organization_id, role, organizations(id, name)")
      .eq("user_id", user.id);

    if (data) {
      const orgs: Organization[] = data.map((m: any) => ({
        id: m.organizations.id,
        name: m.organizations.name,
        role: m.role,
      }));
      setOrganizations(orgs);
      if (!currentOrg && orgs.length > 0) {
        setCurrentOrg(orgs[0]);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrgs();
  }, [user]);

  return (
    <OrgContext.Provider
      value={{
        currentOrg,
        organizations,
        loading,
        setCurrentOrg,
        refreshOrgs: fetchOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}
