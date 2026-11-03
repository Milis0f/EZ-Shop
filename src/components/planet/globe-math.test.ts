import { describe, expect, it } from "vitest";
import { COUNTRY_CODES } from "@/domain/country";
import { cellAt, COUNTRY_CENTRE, lettersOf, shortestTurn, unproject } from "./globe-math";
import { GRID_COLS, GRID_LETTERS, GRID_ROWS, WORLD_GRID } from "./world-grid";

describe("world grid", () => {
  it("has every row at full width", () => {
    expect(WORLD_GRID).toHaveLength(GRID_ROWS);
    expect(WORLD_GRID.every((row) => row.length === GRID_COLS)).toBe(true);
  });

  it("places each analysed country at its own centre", () => {
    for (const code of COUNTRY_CODES) {
      const [lon, lat] = COUNTRY_CENTRE[code];
      expect(WORLD_GRID.some((row) => row.includes(GRID_LETTERS[code])), code).toBe(true);
      // A small country may share the centre cell with a neighbour; a large one never.
      if (!["LU", "BE", "CH", "NL", "DK", "AT"].includes(code)) expect(cellAt(lon, lat), code).toBe(GRID_LETTERS[code]);
    }
  });

  it("knows sea from land", () => {
    expect(cellAt(-30, 30)).toBe("."); // Middle of the North Atlantic.
    expect(cellAt(100, 60)).toBe("#"); // Siberia.
  });

  it("maps highlighted countries to their letters", () => {
    expect(lettersOf(["FR", "AU"])).toEqual(new Set([GRID_LETTERS.FR, GRID_LETTERS.AU]));
  });
});

describe("projection", () => {
  it("shows the facing point at the centre and nothing outside the disc", () => {
    expect(unproject(0, 0, 2.5, 46.5)).toEqual([2.5, 46.5]);
    expect(unproject(0.8, 0.8, 0, 0)).toBeNull();
  });

  it("puts north up", () => {
    const point = unproject(0, 0.5, 0, 0);
    expect(point?.[1]).toBeCloseTo(30, 5);
  });

  it("turns the short way round", () => {
    expect(shortestTurn(170, -170)).toBe(20);
    expect(shortestTurn(-170, 170)).toBe(-20);
    expect(shortestTurn(0, 90)).toBe(90);
  });
});
