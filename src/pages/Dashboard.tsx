import { KPICard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, DollarSign, Clock, Zap, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { mockTickets, mockCustomers, mockInvoices } from "@/lib/mock-data";

export default function Dashboard() {
  // Calculate KPIs from mock data
  const activeSubscriptions = mockCustomers.filter(c => c.status === 'active').length;
  const monthlyRevenue = mockInvoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.amount, 0);
  const overdueAmount = mockInvoices
    .filter(inv => inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.amount, 0);
  const openTickets = mockTickets.filter(t => t.status === 'open').length;

  const recentTickets = mockTickets.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back! Here's what's happening with your network today.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <KPICard
          title="Active Subscribers"
          value={activeSubscriptions}
          description="Total active customers"
          icon={Users}
          trend={{ value: 5.2, isPositive: true }}
        />
        <KPICard
          title="Monthly Revenue"
          value={`$${monthlyRevenue.toLocaleString()}`}
          description="Current month MRR"
          icon={DollarSign}
          trend={{ value: 8.1, isPositive: true }}
        />
        <KPICard
          title="AR Aging"
          value={`$${overdueAmount.toLocaleString()}`}
          description="Overdue invoices"
          icon={Clock}
          trend={{ value: -2.3, isPositive: false }}
        />
        <KPICard
          title="Network Uptime"
          value="99.2%"
          description="Last 30 days"
          icon={Zap}
          trend={{ value: 0.5, isPositive: true }}
        />
        <KPICard
          title="Open Tickets"
          value={openTickets}
          description="Requires attention"
          icon={Ticket}
          trend={{ value: -12.5, isPositive: true }}
        />
      </div>

      {/* Content Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Recent Tickets */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5" />
              Recent Tickets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentTickets.map((ticket) => (
                <div key={ticket.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{ticket.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      {ticket.id} • Created {new Date(ticket.createdDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={ticket.priority === 'high' ? 'destructive' : ticket.priority === 'medium' ? 'warning' : 'default'}>
                      {ticket.priority}
                    </Badge>
                    <Badge variant={ticket.status === 'open' ? 'info' : 'warning'}>
                      {ticket.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Network Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Core Routers</span>
              <Badge variant="success">4/4 Online</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Access Points</span>
              <Badge variant="warning">23/25 Online</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Fiber Distribution</span>
              <Badge variant="success">12/12 Online</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Customer ONTs</span>
              <Badge variant="success">1,247/1,250 Online</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}