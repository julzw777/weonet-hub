import { Loader2, AlertTriangle, Inbox } from "lucide-react";

export function QueryState({ loading, error, empty, emptyText = "Nothing here yet." }: { loading?: boolean; error?: Error | null; empty?: boolean; emptyText?: string }) {
  if (loading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>;
  if (error) return <div className="flex items-center gap-2 p-6 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{error.message}</div>;
  if (empty) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Inbox className="h-4 w-4" />{emptyText}</div>;
  return null;
}
