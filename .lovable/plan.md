# Staff Invitation & RBAC Upgrade

Build a complete invitation-based onboarding flow on top of the existing org/role system, without breaking current logins or the `organization_members.role` enum already wired into RLS.

## Approach

Keep the existing `organization_members` table + `app_role` enum as the source of truth for org membership/role (everything in RLS already depends on it). Layer on:
- **Invitations table** for the pending → accepted lifecycle.
- **Permissions catalog** (`permissions`, `role_permissions`) keyed by `app_role` for fine-grained UI/route gating, with optional custom roles later.
- **Edge functions** for secure invite send + accept (uses service-role to create the auth user + membership atomically).
- **Email** via Lovable's built-in transactional email (scaffold if not present).

## Database (migration)

1. `staff_invitations`
   - `id, organization_id, email, full_name, phone, role app_role, branch_id, token (unique), invited_by, status (pending|accepted|revoked|expired), expires_at (now()+7d), accepted_at, accepted_user_id, created_at, updated_at`
   - RLS: org admins/managers can select/insert/update; public can SELECT a single row by token via SECURITY DEFINER RPC only (no direct anon read).
2. `permissions(key text pk, description text, category text)` — seed with the keys listed by user.
3. `role_permissions(role app_role, permission_key text, PRIMARY KEY(role, permission_key))` — seed defaults per role.
4. Extend `organization_members` with `status text default 'active'` (`active|suspended|pending_invitation`) and `branch_id uuid`.
5. RPCs (SECURITY DEFINER):
   - `get_invitation_by_token(_token text)` → returns org name, role, email, status, expires_at (no auth required).
   - `accept_invitation(_token text)` → links `auth.uid()` to the invitation's org/role/branch, marks accepted, requires the JWT email to match.
   - `user_permissions(_user_id uuid, _org_id uuid)` → returns set of permission keys for that user's role.

## Edge functions

- `invite-staff` (JWT-verified): admin/manager only → creates invitation row + token, sends email via `send-transactional-email`. Idempotent per `(org, email, pending)`.
- `resend-invitation` (JWT): regenerates token + resends email.
- Email template: `staff-invitation.tsx` registered in transactional registry. Link: `${SITE_URL}/invite/{token}`.

## Frontend

- `src/hooks/usePermissions.ts` — loads permission keys for current user/org from RPC, exposes `has(key)`.
- `src/components/PermissionGate.tsx` — wraps menu items / sections.
- Update `RoleRoute` to optionally accept `requiredPermission` and check via `usePermissions`.
- Update `AppSidebar` to filter by permissions (keep role-level fallback).
- `src/pages/InviteAccept.tsx` (public route `/invite/:token`):
   - Reads invite via RPC.
   - If signed-out & no auth user with that email: show signup form (email pre-filled, locked) → `supabase.auth.signUp` with redirect → on session → call `accept_invitation` RPC.
   - If signed-in with matching email: just call `accept_invitation`.
   - On success: toast + redirect to `/pos`.
- Update `StaffManagement.tsx`:
   - Add "Invite Staff" dialog (name/email/phone/role/branch).
   - Table columns Name / Email / Role / Branch / Status with badges + actions (Resend, Edit Role, Change Branch, Suspend, Reactivate).
   - Top stats: Active / Pending / Suspended counts.
- Add `/invite/:token` route in `App.tsx` (outside `PrivateRoute`).

## Permission seed (defaults)

- Owner/admin: all keys.
- Manager: dashboard, inventory.*, sales.*, reports.view, staff.view, customers.*.
- Cashier: dashboard.view, sales.view, sales.create, customers.view.
- Inventory clerk → mapped to `storekeeper`: dashboard.view, inventory.*, suppliers.*, purchases.*.

## Non-goals (kept compatible)

- Don't change existing `app_role` enum values or RLS policies that depend on them.
- Don't replace `organization_members` — invitation accept inserts into it.
- Auth still uses Supabase Auth email/password; we just bootstrap via invitation token.

## Files

**Created**
- `supabase/migrations/<ts>_staff_invitations_rbac.sql`
- `supabase/functions/invite-staff/index.ts`
- `supabase/functions/resend-invitation/index.ts`
- `supabase/functions/_shared/transactional-email-templates/staff-invitation.tsx`
- `src/pages/InviteAccept.tsx`
- `src/hooks/usePermissions.ts`
- `src/components/PermissionGate.tsx`

**Edited**
- `src/App.tsx` (add `/invite/:token`)
- `src/components/RoleRoute.tsx` (permission support)
- `src/components/AppSidebar.tsx` (permission filtering)
- `src/pages/StaffManagement.tsx` (invite UI + status/actions + stats)
- `supabase/functions/_shared/transactional-email-templates/registry.ts` (register template)
- `supabase/config.toml` (register new functions if needed)

Reply **go** to build, or tell me which parts to trim.