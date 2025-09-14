import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Phone, Mail, MapPin } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { mockCustomers, mockSubscriptions, mockInvoices, mockTickets } from "@/lib/mock-data";

export default function Customers() {
  const [selectedCustomer, setSelectedCustomer] = useState(mockCustomers[0]);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCustomers = mockCustomers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const customerSubscriptions = mockSubscriptions.filter(sub => sub.customerId === selectedCustomer.id);
  const customerInvoices = mockInvoices.filter(inv => inv.customerId === selectedCustomer.id);
  const customerTickets = mockTickets.filter(ticket => ticket.customerId === selectedCustomer.id);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground">Manage customer accounts and view 360° profiles</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Customer
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Customer List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Customer List</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="space-y-1">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className={`p-3 cursor-pointer hover:bg-accent border-b border-border last:border-b-0 ${
                    selectedCustomer.id === customer.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedCustomer(customer)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-sm font-medium">{customer.name}</h4>
                      <p className="text-xs text-muted-foreground">{customer.email}</p>
                    </div>
                    <StatusBadge status={customer.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Customer 360 View */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl">{selectedCustomer.name}</CardTitle>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Mail className="h-4 w-4" />
                    {selectedCustomer.email}
                  </div>
                  <div className="flex items-center gap-1">
                    <Phone className="h-4 w-4" />
                    {selectedCustomer.phone}
                  </div>
                </div>
              </div>
              <StatusBadge status={selectedCustomer.status} />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="profile" className="space-y-4">
              <TabsList>
                <TabsTrigger value="profile">Profile</TabsTrigger>
                <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
                <TabsTrigger value="tickets">Tickets</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Contact Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        {selectedCustomer.email}
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        {selectedCustomer.phone}
                      </div>
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>{selectedCustomer.address}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-2">Account Details</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Customer ID:</span> {selectedCustomer.id}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Join Date:</span> {selectedCustomer.joinDate}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span> 
                        <StatusBadge status={selectedCustomer.status} className="ml-2" />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="subscriptions" className="space-y-4">
                {customerSubscriptions.length > 0 ? (
                  <div className="space-y-3">
                    {customerSubscriptions.map((subscription) => (
                      <div key={subscription.id} className="border border-border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{subscription.planName}</h4>
                            <p className="text-sm text-muted-foreground">{subscription.speed}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Next billing: {subscription.nextBilling}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold">${subscription.price}</div>
                            <StatusBadge status={subscription.status} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No active subscriptions</p>
                )}
              </TabsContent>

              <TabsContent value="invoices" className="space-y-4">
                {customerInvoices.length > 0 ? (
                  <div className="space-y-3">
                    {customerInvoices.map((invoice) => (
                      <div key={invoice.id} className="border border-border rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <h4 className="font-medium">{invoice.id}</h4>
                            <p className="text-sm text-muted-foreground">
                              Due: {invoice.dueDate} • Created: {invoice.createdDate}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-semibold">${invoice.amount}</div>
                            <StatusBadge status={invoice.status} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No invoices found</p>
                )}
              </TabsContent>

              <TabsContent value="tickets" className="space-y-4">
                {customerTickets.length > 0 ? (
                  <div className="space-y-3">
                    {customerTickets.map((ticket) => (
                      <div key={ticket.id} className="border border-border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-medium">{ticket.title}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{ticket.description}</p>
                            <p className="text-xs text-muted-foreground mt-2">
                              {ticket.id} • Created: {new Date(ticket.createdDate).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant={
                              ticket.priority === 'critical' ? 'destructive' :
                              ticket.priority === 'high' ? 'destructive' :
                              ticket.priority === 'medium' ? 'warning' : 'default'
                            }>
                              {ticket.priority}
                            </Badge>
                            <StatusBadge status={ticket.status} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No tickets found</p>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}