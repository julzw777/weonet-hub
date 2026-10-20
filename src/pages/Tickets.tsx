import { SampleDataNotice } from "@/components/sample-data-notice";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Clock, User } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { mockTickets, mockCustomers } from "@/lib/mock-data";

interface TicketColumn {
  id: string;
  title: string;
  status: string;
  tickets: typeof mockTickets;
}

export default function Tickets() {
  const [columns] = useState<TicketColumn[]>([
    {
      id: 'open',
      title: 'Open',
      status: 'open',
      tickets: mockTickets.filter(t => t.status === 'open')
    },
    {
      id: 'in-progress',
      title: 'In Progress',
      status: 'in-progress',
      tickets: mockTickets.filter(t => t.status === 'in-progress')
    },
    {
      id: 'resolved',
      title: 'Resolved',
      status: 'resolved',
      tickets: mockTickets.filter(t => t.status === 'resolved')
    },
    {
      id: 'closed',
      title: 'Closed',
      status: 'closed',
      tickets: mockTickets.filter(t => t.status === 'closed')
    }
  ]);

  const getSLAStatus = (deadline: string) => {
    const now = new Date();
    const slaDate = new Date(deadline);
    const hoursRemaining = (slaDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    if (hoursRemaining < 0) return { status: 'overdue', color: 'destructive', text: 'Overdue' };
    if (hoursRemaining < 4) return { status: 'critical', color: 'destructive', text: `${Math.floor(hoursRemaining)}h left` };
    if (hoursRemaining < 24) return { status: 'warning', color: 'warning', text: `${Math.floor(hoursRemaining)}h left` };
    return { status: 'ok', color: 'success', text: `${Math.floor(hoursRemaining / 24)}d left` };
  };

  return (
    <div className="space-y-6">
      <SampleDataNotice what="Tickets" />
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tickets</h1>
          <p className="text-muted-foreground">Track and manage customer support tickets</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Ticket
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {columns.map((column) => (
          <Card key={column.id}>
            <CardContent className="p-6">
              <div className="text-2xl font-bold">{column.tickets.length}</div>
              <p className="text-xs text-muted-foreground">{column.title} Tickets</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Kanban Board */}
      <div className="grid gap-6 md:grid-cols-4">
        {columns.map((column) => (
          <Card key={column.id} className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                {column.title}
                <Badge variant="secondary">{column.tickets.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {column.tickets.map((ticket) => {
                const customer = mockCustomers.find(c => c.id === ticket.customerId);
                const sla = getSLAStatus(ticket.slaDeadline);
                
                return (
                  <Card key={ticket.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Ticket Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-sm leading-tight">{ticket.title}</h4>
                            <p className="text-xs text-muted-foreground mt-1">{ticket.id}</p>
                          </div>
                          <Badge
                            variant={
                              ticket.priority === 'critical' ? 'destructive' :
                              ticket.priority === 'high' ? 'destructive' :
                              ticket.priority === 'medium' ? 'warning' : 'default'
                            }
                            className="text-xs"
                          >
                            {ticket.priority}
                          </Badge>
                        </div>

                        {/* Customer Info */}
                        <div className="text-xs text-muted-foreground">
                          <User className="h-3 w-3 inline mr-1" />
                          {customer?.name}
                        </div>

                        {/* Category Badge */}
                        <Badge variant="outline" className="text-xs">
                          {ticket.category}
                        </Badge>

                        {/* SLA Countdown */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-xs">
                            <Clock className="h-3 w-3" />
                            <Badge variant={sla.color as any} className="text-xs">
                              {sla.text}
                            </Badge>
                          </div>
                          {ticket.assignee && (
                            <div className="text-xs text-muted-foreground">
                              {ticket.assignee}
                            </div>
                          )}
                        </div>

                        {/* Creation Date */}
                        <div className="text-xs text-muted-foreground">
                          Created: {new Date(ticket.createdDate).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              
              {column.tickets.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No {column.title.toLowerCase()} tickets
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}