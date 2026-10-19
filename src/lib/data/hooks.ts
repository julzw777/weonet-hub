import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import type { StaffRole } from "@/lib/auth";

const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
  return data as T;
};

export type Customer = Tables<"customers">;
export type Plan = Tables<"service_plans">;
export type Subscription = Tables<"subscriptions"> & { service_plans: Pick<Plan, "name" | "monthly_price"> | null };

export const useCustomers = () =>
  useQuery({ queryKey: ["customers"], queryFn: async () => unwrap<Customer[]>(await supabase.from("customers").select("*").order("full_name")) });

export const usePlans = () =>
  useQuery({ queryKey: ["plans"], queryFn: async () => unwrap<Plan[]>(await supabase.from("service_plans").select("*").order("monthly_price")) });

export const useSubscriptions = (customerId?: string) =>
  useQuery({
    queryKey: ["subscriptions", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      if (!customerId) return [];
      return unwrap<Subscription[]>(
        await supabase.from("subscriptions").select("*, service_plans(name, monthly_price)").eq("customer_id", customerId).order("created_at", { ascending: false }),
      );
    },
  });

function useSave<T>(key: string, fn: (v: T) => PromiseLike<{ error: { message: string } | null }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => { const { error } = await fn(v); if (error) throw new Error(error.message); },
    onSuccess: () => qc.invalidateQueries({ queryKey: [key] }),
  });
}

export const useSaveCustomer = () =>
  useSave<TablesInsert<"customers"> & { id?: string }>("customers", ({ id, ...v }) =>
    id ? supabase.from("customers").update(v as TablesUpdate<"customers">).eq("id", id) : supabase.from("customers").insert(v));

export const useSavePlan = () =>
  useSave<TablesInsert<"service_plans"> & { id?: string }>("plans", ({ id, ...v }) =>
    id ? supabase.from("service_plans").update(v).eq("id", id) : supabase.from("service_plans").insert(v));

export const useCreateSubscription = () =>
  useSave<TablesInsert<"subscriptions">>("subscriptions", (v) => supabase.from("subscriptions").insert(v));

export const useSetSubscriptionStatus = () =>
  useSave<{ id: string; status: string }>("subscriptions", ({ id, status }) => supabase.from("subscriptions").update({ status }).eq("id", id));

export type StaffRow = Tables<"staff_profiles"> & { roles: StaffRole[] };
export const useStaff = () =>
  useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const profiles = unwrap<Tables<"staff_profiles">[]>(await supabase.from("staff_profiles").select("*").order("full_name"));
      const roles = unwrap<Tables<"user_roles">[]>(await supabase.from("user_roles").select("*"));
      return profiles.map((p) => ({ ...p, roles: roles.filter((r) => r.user_id === p.id).map((r) => r.role) })) as StaffRow[];
    },
  });

export const useAddRole = () =>
  useSave<{ user_id: string; role: StaffRole }>("staff", (v) => supabase.from("user_roles").insert(v));
export const useRemoveRole = () =>
  useSave<{ user_id: string; role: StaffRole }>("staff", (v) => supabase.from("user_roles").delete().eq("user_id", v.user_id).eq("role", v.role));
