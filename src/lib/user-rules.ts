// UI mirror of the admin-users edge function rules. The server is the real enforcement.
import type { StaffRole } from "./auth";

export type HubUserStatus = "active" | "deactivated" | "pending_password_change";

export interface HubUser {
  id: string;
  full_name: string;
  email: string;
  roles: StaffRole[];
  status: HubUserStatus;
  last_sign_in_at: string | null;
}

/** Friendly labels; Super Admin = admin, Support = care, Read Only = readonly. */
export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Super Admin",
  noc: "NOC",
  finance: "Finance",
  care: "Support",
  tech: "Tech",
  warehouse: "Warehouse",
  readonly: "Read Only",
};

export const STATUS_LABELS: Record<HubUserStatus, string> = {
  active: "Active",
  deactivated: "Deactivated",
  pending_password_change: "Pending Password Change",
};

export const roleLabel = (r: StaffRole) => ROLE_LABELS[r] ?? r;

export const deriveStatus = (banned: boolean, mustChangePassword: boolean): HubUserStatus =>
  banned ? "deactivated" : mustChangePassword ? "pending_password_change" : "active";

/** A Super Admin cannot deactivate or demote their own account. */
export const canModifyTarget = (actorId: string, targetId: string) => actorId !== targetId;

/** The final Super Admin account cannot be demoted or deactivated. */
export const canRemoveSuperAdmin = (superAdminCount: number, targetIsSuperAdmin: boolean) =>
  !targetIsSuperAdmin || superAdminCount > 1;

export const MIN_PASSWORD_LENGTH = 8;
export const validTempPassword = (pw: string) => typeof pw === "string" && pw.length >= MIN_PASSWORD_LENGTH;

export const filterUsers = (users: HubUser[], query: string): HubUser[] => {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter((u) =>
    u.full_name.toLowerCase().includes(q) ||
    u.email.toLowerCase().includes(q) ||
    u.roles.some((r) => roleLabel(r).toLowerCase().includes(q) || r.includes(q)) ||
    STATUS_LABELS[u.status].toLowerCase().includes(q),
  );
};

/** Generates a random temporary password (letters + digits, no ambiguous chars). */
export const generateTempPassword = (length = 12): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join("");
};
