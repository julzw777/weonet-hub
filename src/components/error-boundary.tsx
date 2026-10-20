import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("Page error:", error.message); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="space-y-3 p-6"><h1 className="text-xl font-semibold">Something went wrong on this page</h1><p className="text-sm text-muted-foreground">No changes were saved by this error. Try again, or go back to the dashboard.</p><div className="flex gap-2"><Button onClick={() => this.setState({ error: null })}>Try again</Button><Button variant="outline" onClick={() => { window.location.href = "/"; }}>Dashboard</Button></div></div>;
  }
}
