import { describe, expect, it } from "vitest";
import {
  returnActionLabel,
  returnLabelFromPath,
} from "@/lib/navigationReturn";

describe("navigationReturn", () => {
  it("labels common return paths", () => {
    expect(returnLabelFromPath("/library")).toBe("Library");
    expect(returnLabelFromPath("/library?q=ghost")).toBe("Library");
    expect(returnLabelFromPath("/favorites")).toBe("Favorites");
    expect(returnLabelFromPath("/collections")).toBe("Collections");
    expect(returnLabelFromPath("/collections/col-1")).toBe("Collection");
    expect(returnLabelFromPath("/projects")).toBe("Projects");
    expect(returnLabelFromPath("/projects/proj-1?x=1")).toBe("Project");
  });

  it("builds back CTA labels", () => {
    expect(returnActionLabel("/library")).toBe("Back to Library");
    expect(returnActionLabel("/favorites")).toBe("Back to Favorites");
  });
});
