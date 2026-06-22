import { describe, expect, it } from "vitest";
import { gatewayRunOptions, resolveGatewayId } from "./ai-gateway";

describe("resolveGatewayId", () => {
  it("returns undefined for empty, whitespace, or missing values", () => {
    expect(resolveGatewayId("")).toBeUndefined();
    expect(resolveGatewayId("   ")).toBeUndefined();
    expect(resolveGatewayId(undefined)).toBeUndefined();
    expect(resolveGatewayId(null)).toBeUndefined();
  });

  it("trims and returns a configured id", () => {
    expect(resolveGatewayId("  default  ")).toBe("default");
    expect(resolveGatewayId("podcast-gw")).toBe("podcast-gw");
  });
});

describe("gatewayRunOptions", () => {
  it("is empty when no gateway is configured", () => {
    expect(gatewayRunOptions(undefined)).toEqual({});
  });

  it("includes the gateway id when configured", () => {
    expect(gatewayRunOptions("default")).toEqual({ gateway: { id: "default" } });
  });
});
