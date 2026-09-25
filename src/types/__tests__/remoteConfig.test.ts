import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMOTE_CONFIG,
  isRemoteConfigured,
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
});
