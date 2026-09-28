import { describe, expect, it } from "vitest";
import {
  REMOTE_LOCATION_PATH,
  remoteFileToLibraryFile,
} from "@/lib/remoteFiles";

describe("remoteFileToLibraryFile", () => {
  it("maps catalog entry to a LibraryFile with remote location", () => {
    const file = remoteFileToLibraryFile({
      id: "11111111-1111-4111-8111-111111111111",
      name: "robot.3mf",
      extension: "3mf",
      size: 42,
      contentHash: "abc",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    });

    expect(file.libraryFileId).toBe("11111111-1111-4111-8111-111111111111");
    expect(file.name).toBe("robot.3mf");
    expect(file.extension).toBe("3mf");
    expect(file.locationPath).toBe(REMOTE_LOCATION_PATH);
    expect(file.analysisStatus).toBe("ready");
    expect(file.hasRemoteThumbnail).toBe(false);
    expect(file.addedAt).toBe(Date.parse("2026-01-01T00:00:00Z"));
    expect(file.modifiedAt).toBe(Date.parse("2026-01-02T00:00:00Z"));
  });

  it("marks hasRemoteThumbnail when the catalog advertises a thumb", () => {
    const file = remoteFileToLibraryFile({
      id: "11111111-1111-4111-8111-111111111111",
      name: "robot.3mf",
      extension: "3mf",
      size: 42,
      contentHash: "abc",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      hasThumbnail: true,
    });
    expect(file.hasRemoteThumbnail).toBe(true);
    expect(file.analysisStatus).toBe("ready");
  });
});
