import { describe, expect, it } from "vitest";

const hasCapacity = (occupied: number, requested: number, capacity = 3) =>
  occupied + requested <= capacity;

const validTransition = (from: string, to: string) =>
  ({ REQUESTED: ["ACCEPTED", "CANCELLED"], ACCEPTED: ["DRIVER_ARRIVED", "CANCELLED"], DRIVER_ARRIVED: ["STARTED"], STARTED: ["COMPLETED"] } as Record<string, string[]>)[from]?.includes(to) ?? false;

const pooledFare = (basePaisa: number) => Math.max(0, basePaisa - 2000);

describe("Dhaka Tesla Pool", () => {
  it("prevents overbooking a three-seat vehicle", () => {
    expect(hasCapacity(2, 1)).toBe(true);
    expect(hasCapacity(2, 2)).toBe(false);
  });

  it("rejects invalid ride transitions", () => {
    expect(validTransition("REQUESTED", "ACCEPTED")).toBe(true);
    expect(validTransition("REQUESTED", "COMPLETED")).toBe(false);
  });

  it("applies pool discount in integer paisa", () => {
    expect(pooledFare(10000)).toBe(8000);
  });
});
