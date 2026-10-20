import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'secondary' | 'outline';
  className?: string;
}

const statusVariants = {
  // Common status mappings
  active: 'success',
  online: 'success',
  paid: 'success',
  resolved: 'success',
  closed: 'success',
  'in-stock': 'success',
  
  pending: 'warning',
  warning: 'warning',
  'in-progress': 'warning',
  draft: 'warning',
  'low-stock': 'warning',
  
  inactive: 'destructive',
  offline: 'destructive',
  overdue: 'destructive',
  failed: 'destructive',
  logged: 'secondary',
  sent: 'info',
  delivered: 'success',
  healthy: 'success',
  succeeded: 'success',
  error: 'destructive',
  rejected: 'destructive',
  unconfigured: 'warning',
  unavailable: 'secondary',
  never_checked: 'secondary',
  reversed: 'destructive',
  partial: 'warning',
  unpaid: 'warning',
  unmatched: 'info',
  matched: 'success',
  suspended: 'destructive',
  cancelled: 'destructive',
  'out-of-stock': 'destructive',
  
  open: 'info',
  disconnected: 'info',
} as const;

export function StatusBadge({ status, variant, className }: StatusBadgeProps) {
  const badgeVariant = variant || statusVariants[status as keyof typeof statusVariants] || 'default';
  
  return (
    <Badge
      variant={badgeVariant}
      className={cn("capitalize", className)}
    >
      {status.replace('-', ' ')}
    </Badge>
  );
}