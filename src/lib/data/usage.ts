import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Granularity, UsagePoint } from "@/lib/usage-rules";

export function useUsageSeries(subscriptionId: string | null, g: Granularity, from: Date, to: Date) {
  return useQuery({
    queryKey: ["usage", subscriptionId, g, from.toISOString(), to.toISOString()],
    enabled: !!subscriptionId,
    queryFn: async (): Promise<UsagePoint[]> => {
      const { data, error } = await supabase.rpc("usage_series", {
        _subscription_id: subscriptionId!,
        _granularity: g,
        _from: from.toISOString(),
        _to: to.toISOString(),
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({ bucket: r.bucket_start as string, rx: Number(r.rx_bytes), tx: Number(r.tx_bytes) }));
    },
  });
}
