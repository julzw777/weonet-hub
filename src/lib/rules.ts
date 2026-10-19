// UI mirror of the database rules. The database (RLS + triggers) is the real enforcement.
import type { StaffRole } from "./auth";

export type SubStatus = "pending" | "active" | "suspended" | "cancelled";

const has = (roles: StaffRole[], allowed: StaffRole[]) => roles.includes("admin") || allowed.some((r) => roles.includes(r));

export const canEditCustomers = (roles: StaffRole[]) => has(roles, ["care"]);
export const canEditPlans = (roles: StaffRole[]) => has(roles, ["finance"]);
export const canEditSubscriptions = (roles: StaffRole[]) => has(roles, ["care", "noc"]);
export const canManageRoles = (roles: StaffRole[]) => roles.includes("admin");

const TRANSITIONS: Record<SubStatus, SubStatus[]> = {
  pending: ["active", "cancelled"],
  active: ["suspended", "cancelled"],
  suspended: ["active", "cancelled"],
  cancelled: [],
};
export const nextStatuses = (s: SubStatus) => TRANSITIONS[s] ?? [];
export const canTransition = (from: SubStatus, to: SubStatus) => nextStatuses(from).includes(to);

/** Admins may not remove their own admin role (lockout protection). */
export const canRemoveRole = (actorId: string, targetId: string, role: StaffRole) =>
  !(role === "admin" && actorId === targetId);
