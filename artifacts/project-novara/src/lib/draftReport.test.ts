import { describe, it, expect } from "vitest";
import { draftReport, DRAFT_REPORT_SUBJECT } from "./draftReport";

describe("draftReport", () => {
  it("sends the AI's draft through the feedback endpoint", () => {
    const report = draftReport("Hi Ada, great to meet you.", "/contacts/1");
    expect(report.type).toBe("general");
    expect(report.subject).toBe(DRAFT_REPORT_SUBJECT);
    expect(report.description).toContain("Hi Ada, great to meet you.");
    expect(report.pageUrl).toBe("/contacts/1");
    expect(report.mayContact).toBe(false);
  });

  it("stays within the feedback length limit", () => {
    expect(draftReport("x".repeat(10_000)).description.length).toBeLessThanOrEqual(5000);
  });
});
