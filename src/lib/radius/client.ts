import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Op, RadiusAccounting, RadiusNas, RadiusPlan, RadiusSession, RadiusSubscriber, SubscriberStatus } from "../../../supabase/functions/radius-api/lib";

export type { RadiusAccounting, RadiusNas, RadiusPlan, RadiusSession, RadiusSubscriber, SubscriberStatus };
export interface RadiusResult<T> { data: T; mock: boolean }

/** Typed client. All calls go through the radius-api server function; the browser never sees the RADIUS URL or token. */
export async function radiusCall<T>(op: Op): Promise<RadiusResult<T>> {
  const { data, error } = await supabase.functions.invoke("radius-api", { body: op });
  if (error) {
    let msg = error.message;
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* keep default */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return { data: data.data as T, mock: !!data.mock };
}

export const useRadiusSubscribers = (search: string) => useQuery({ queryKey: ["radius", "subs", search], queryFn: () => radiusCall<RadiusSubscriber[]>({ op: "list_subscribers", ...(search ? { search } : {}) }) });
export const useRadiusPlans = () => useQuery({ queryKey: ["radius", "plans"], queryFn: () => radiusCall<RadiusPlan[]>({ op: "list_plans" }) });
export const useRadiusSessions = () => useQuery({ queryKey: ["radius", "sessions"], queryFn: () => radiusCall<RadiusSession[]>({ op: "list_sessions" }) });
export const useRadiusAccounting = () => useQuery({ queryKey: ["radius", "acct"], queryFn: () => radiusCall<RadiusAccounting[]>({ op: "list_accounting" }) });
export const useRadiusNas = () => useQuery({ queryKey: ["radius", "nas"], queryFn: () => radiusCall<RadiusNas[]>({ op: "list_nas" }) });

function useWrite<V, T>(fn: (v: V) => Promise<RadiusResult<T>>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries({ queryKey: ["radius", "subs"] }); qc.invalidateQueries({ queryKey: ["audit"] }); } });
}
export const useCreateSubscriber = () => useWrite((v: { username: string; full_name: string; plan_id: string; password: string }) => radiusCall<RadiusSubscriber>({ op: "create_subscriber", ...v }));
export const useSetSubscriberStatus = () => useWrite((v: { id: string; status: SubscriberStatus }) => radiusCall<RadiusSubscriber>({ op: "set_status", ...v }));
export const useResetPassword = () => useWrite((v: { id: string }) => radiusCall<{ temporary_password: string }>({ op: "reset_password", ...v }));
