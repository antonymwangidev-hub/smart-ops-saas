import { useOrg } from "@/contexts/OrgContext";

export type OrgRole = "admin" | "manager" | "accountant" | "storekeeper" | "staff" | "cashier" | "attendant";

// Higher number = more privilege
export const ROLE_LEVEL: Record<OrgRole, number> = {
  admin: 6,
  manager: 5,
  accountant: 4,
  storekeeper: 3,
  staff: 2,
  cashier: 2,
  attendant: 1,
};

// Routes each role can access (besides admin which has full access)
const ROLE_ROUTES: Record<OrgRole, string[]> = {
  admin: ["*"],
  manager: ["*"],
  accountant: [
    "/dashboard", "/finance", "/expenses", "/debtors", "/credit-sales",
    "/suppliers", "/purchases", "/analytics", "/notifications", "/settings", "/attendance",
  ],
  storekeeper: [
    "/products", "/suppliers", "/purchases", "/stock-transfers", "/returns",
    "/dashboard", "/notifications", "/settings", "/attendance",
  ],
  staff: [
    "/pos", "/daily-summary", "/credit-sales", "/products", "/returns",
    "/suppliers", "/purchases", "/expenses", "/debtors",
    "/dashboard", "/customers", "/orders", "/tasks", "/automations",
    "/documents", "/analytics", "/notifications", "/settings",
    "/stock-transfers", "/attendance", "/reports", "/reports/expiry",
  ],
  cashier: ["/pos", "/daily-summary", "/credit-sales", "/returns", "/attendance", "/notifications", "/settings"],
  attendant: ["/pos", "/daily-summary", "/attendance"],
};

export function useOrgRole() {
  const { currentOrg } = useOrg();
  const role = (currentOrg?.role as OrgRole) || "attendant";

  const canAccess = (path: string): boolean => {
    const allowed = ROLE_ROUTES[role];
    if (!allowed) return false;
    if (allowed.includes("*")) return true;
    return allowed.includes(path);
  };

  const level = ROLE_LEVEL[role] || 1;
  const isOwner = role === "admin";
  const isManager = role === "manager" || isOwner;
  const isStaff = level >= ROLE_LEVEL.staff;
  const isAttendant = role === "attendant";

  return { role, canAccess, isOwner, isManager, isStaff, isAttendant, level };
}
