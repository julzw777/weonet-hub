import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
import { supabase } from "@/integrations/supabase/client";
import { radiusCall } from "./client";

describe("unconfirmed Hub RADIUS boundary", () => {
  it("blocks a real Hub provisioning attempt before any server call", async () => {
    await expect(radiusCall({ op: "create_subscriber", username: "staging.user", full_name: "Staging", plan_id: "plan-1", password: "staging-password" })).rejects.toThrow("No request was sent");
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
  it("also blocks legacy sample reads so demo data cannot enter production queries", async () => {
    await expect(radiusCall({ op: "list_subscribers" })).rejects.toThrow("unconfigured");
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});