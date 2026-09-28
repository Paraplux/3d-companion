import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_CONFIG,
  isRemoteConfigured,
  normalizeImportsAfterAction,
  normalizeRemoteBaseUrl,
} from "@/types/remoteConfig";

describe("remoteConfig helpers", () => {
  it("treats empty defaults as not configured", () => {
    expect(isRemoteConfigured(DEFAULT_REMOTE_CONFIG)).toBe(false);
  });

  it("requires both url and api key", () => {
    expect(
      isRemoteConfigured({
        ...DEFAULT_REMOTE_CONFIG,
        baseUrl: "https://api.example.com",
      }),
    ).toBe(false);
    expect(
      isRemoteConfigured({
        ...DEFAULT_REMOTE_CONFIG,
        baseUrl: "https://api.example.com",
        apiKey: "secret",
      }),
    ).toBe(true);
  });

  it("normalizes trailing slash and /v1 suffix", () => {
    expect(normalizeRemoteBaseUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com",
    );
    expect(normalizeRemoteBaseUrl("https://api.example.com/")).toBe(
      "https://api.example.com",
    );
  });

  it("normalizes imports after-action values", () => {
    expect(normalizeImportsAfterAction("keep")).toBe("keep");
    expect(normalizeImportsAfterAction("delete")).toBe("delete");
    expect(normalizeImportsAfterAction("move")).toBe("move");
    expect(normalizeImportsAfterAction("nope")).toBe("move");
    expect(normalizeImportsAfterAction(undefined)).toBe("move");
  });
});
