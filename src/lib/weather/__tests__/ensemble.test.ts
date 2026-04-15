import { describe, it, expect } from "vitest";
import { parseEnsembleMembers } from "../client";

describe("parseEnsembleMembers", () => {
  it("extracts member values for a given day index", () => {
    const daily: Record<string, unknown> = {
      time: ["2026-04-15"],
      temperature_2m_max: [85.0],
      temperature_2m_max_member01: [84.0],
      temperature_2m_max_member02: [86.0],
      temperature_2m_max_member03: [85.5],
    };
    const members = parseEnsembleMembers(daily, 0);
    expect(members).toEqual([84.0, 86.0, 85.5]);
  });

  it("filters out null member values", () => {
    const daily: Record<string, unknown> = {
      time: ["2026-04-15"],
      temperature_2m_max: [85.0],
      temperature_2m_max_member01: [84.0],
      temperature_2m_max_member02: [null],
      temperature_2m_max_member03: [85.5],
    };
    const members = parseEnsembleMembers(daily, 0);
    expect(members).toEqual([84.0, 85.5]);
  });

  it("returns empty array when no member keys exist", () => {
    const daily: Record<string, unknown> = {
      time: ["2026-04-15"],
      temperature_2m_max: [85.0],
    };
    const members = parseEnsembleMembers(daily, 0);
    expect(members).toEqual([]);
  });

  it("uses correct day index for multi-day response", () => {
    const daily: Record<string, unknown> = {
      time: ["2026-04-15", "2026-04-16"],
      temperature_2m_max: [85.0, 90.0],
      temperature_2m_max_member01: [84.0, 89.0],
      temperature_2m_max_member02: [86.0, 91.0],
    };
    const day0 = parseEnsembleMembers(daily, 0);
    const day1 = parseEnsembleMembers(daily, 1);
    expect(day0).toEqual([84.0, 86.0]);
    expect(day1).toEqual([89.0, 91.0]);
  });
});
