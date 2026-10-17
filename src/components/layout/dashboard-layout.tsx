import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { Button } from "@/components/ui/button";
import { Bell, Search, User, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { session, roles, signOut } = useAuth();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <div className="min-w-0 flex-1 flex flex-col">
          {/* Header */}
          <header className="h-16 border-b border-border/40 bg-background">
            <div className="flex items-center justify-between gap-3 px-4 md:px-6 h-full">
              <div className="flex items-center gap-4">
                <SidebarTrigger />
                <div className="relative hidden sm:block max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search customers, tickets, devices..."
                      className="pl-10 w-64 lg:w-80 bg-card border-border/60"
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                </Button>
                <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-4 w-4" />{session?.user.email}
                  <span className="ml-1 rounded bg-primary/20 px-1.5 py-0.5 uppercase text-primary">{roles.join(", ") || "no role"}</span>
                </span>
                <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="dashboard-content min-w-0 flex-1 p-4 md:p-6 bg-background">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}