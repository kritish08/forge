import { ALIASES, searchTextFor } from "./TimezoneField";

/**
 * Timezone aliases.
 *
 * Found while validating the runbook: Chromium's Intl.supportedValuesOf lists
 * Asia/Calcutta and not Asia/Kolkata, so a user in India searching for their own
 * city by the name it has actually had since 2001 got "Nothing matches". Which
 * spelling an engine ships is not something the app can rely on, so both have to
 * match.
 */
describe("searchTextFor", () => {
  test("a renamed zone matches under either name", () => {
    const hay = searchTextFor("Asia/Calcutta");
    expect(hay).toContain("calcutta");
    expect(hay).toContain("kolkata");
  });

  test("works in the other direction too, for engines that list the modern name", () => {
    const hay = searchTextFor("Asia/Kolkata");
    expect(hay).toContain("kolkata");
    expect(hay).toContain("calcutta");
  });

  test("underscores are searchable as spaces", () => {
    // "Ho Chi Minh" is what someone types; the zone is Asia/Ho_Chi_Minh.
    expect(searchTextFor("Asia/Ho_Chi_Minh")).toContain("ho chi minh");
    expect(searchTextFor("America/New_York")).toContain("new york");
  });

  test("an ordinary zone is unaffected", () => {
    expect(searchTextFor("Europe/London")).toBe("europe/london");
  });

  test.each(Object.entries(ALIASES))("%s is findable as %s", (legacy, modern) => {
    const city = modern.split("/").pop().toLowerCase();
    expect(searchTextFor(legacy)).toContain(city);
  });
});
