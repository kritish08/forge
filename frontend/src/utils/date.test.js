import {
  addDays, daysBetween, weekdayIso, isoWeekMonday, lastNDays, dateInTz, parseDateStr,
} from "./date";

// Reference dates: 2026-01-15 is a Thursday, 2026-01-12 a Monday, 2026-01-18 a Sunday.

describe("weekdayIso — ISO convention, 0=Mon", () => {
  test("matches the backend's numbering", () => {
    expect(weekdayIso("2026-01-12")).toBe(0); // Mon
    expect(weekdayIso("2026-01-15")).toBe(3); // Thu
    expect(weekdayIso("2026-01-18")).toBe(6); // Sun
  });
});

describe("isoWeekMonday", () => {
  test("Sunday belongs to the week that started the previous Monday", () => {
    // The habit calendar used to be Sunday-first while every server-side week
    // calculation is Monday-first, so a times_per_week habit was scored against
    // a different week than the one drawn.
    expect(isoWeekMonday("2026-01-18")).toBe("2026-01-12");
  });
  test("mid-week and Monday itself", () => {
    expect(isoWeekMonday("2026-01-15")).toBe("2026-01-12");
    expect(isoWeekMonday("2026-01-12")).toBe("2026-01-12");
  });
});

describe("day arithmetic", () => {
  test("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  test("is not disturbed by a DST transition", () => {
    // US spring-forward is 2026-03-08. Arithmetic runs on UTC-midnight dates
    // precisely so a 23-hour local day cannot drop or repeat one.
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
  });

  test("daysBetween is signed — negative means the future", () => {
    expect(daysBetween("2026-01-10", "2026-01-15")).toBe(5);
    expect(daysBetween("2026-01-20", "2026-01-15")).toBe(-5);
  });

  test("lastNDays returns oldest-first and includes the end date", () => {
    expect(lastNDays("2026-01-15", 3)).toEqual(["2026-01-13", "2026-01-14", "2026-01-15"]);
  });

  test("parseDateStr anchors at UTC midnight", () => {
    expect(parseDateStr("2026-01-15").toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
});

describe("dateInTz — the timezone bug this module exists to prevent", () => {
  test("renders the calendar day in the requested zone, not UTC", () => {
    // One instant, three different calendar days.
    expect(dateInTz(new Date("2026-09-06T11:00:00Z"), "UTC")).toBe("2026-09-06");
    expect(dateInTz(new Date("2026-09-06T11:00:00Z"), "Pacific/Kiritimati")).toBe("2026-09-07"); // +14
    expect(dateInTz(new Date("2026-09-06T05:00:00Z"), "Pacific/Midway")).toBe("2026-09-05");     // -11
  });

  test("an unknown zone falls back instead of throwing", () => {
    expect(typeof dateInTz(new Date("2026-09-06T12:00:00Z"), "Not/AZone")).toBe("string");
  });
});
