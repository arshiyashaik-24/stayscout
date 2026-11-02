import { describe, expect, it } from "vitest";
import { adjustedRating, haversineKm, normaliseWeights, rank, type Listing, type Preferences } from "../src/index";

const base: Listing = {
  id: 1, name: "Base", neighbourhood: "Centrum-West", lat: 52.374, lon: 4.89, price: 150,
  accommodates: 2, bedrooms: 1, roomType: "Entire home", rating: 4.6, reviewCount: 50, amenities: ["Wifi"],
};
const make = (id: number, o: Partial<Listing>): Listing => ({ ...base, id, name: `L${id}`, ...o });
const prefs: Preferences = {
  weights: { price: 1, rating: 1, distance: 1, amenities: 1 },
  anchor: { lat: 52.3791, lon: 4.9003 },
  wantedAmenities: ["Wifi", "Kitchen"],
};

describe("haversineKm", () => {
  it("matches the known Paris-London great-circle distance", () => {
    const d = haversineKm({ lat: 48.8566, lon: 2.3522 }, { lat: 51.5074, lon: -0.1278 });
    expect(d).toBeGreaterThan(342);
    expect(d).toBeLessThan(345);
  });
  it("is zero for the same point and symmetric", () => {
    const a = { lat: 52.37, lon: 4.89 }, b = { lat: 52.35, lon: 4.93 };
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 12);
  });
});

describe("adjustedRating", () => {
  it("does not let one perfect review beat a strong long track record", () => {
    const fewReviews = adjustedRating(5.0, 1, 4.5, 10);
    const manyReviews = adjustedRating(4.8, 500, 4.5, 10);
    expect(fewReviews).toBeLessThan(manyReviews);
  });
  it("falls back to the prior mean without reviews and approaches the raw rating with many", () => {
    expect(adjustedRating(null, 0, 4.4, 10)).toBe(4.4);
    expect(adjustedRating(4.9, 100000, 4.4, 10)).toBeCloseTo(4.9, 3);
  });
});

describe("normaliseWeights", () => {
  it("sums to one, and treats all-zero weights as equal", () => {
    const w = normaliseWeights({ price: 3, rating: 1, distance: 0, amenities: 0 });
    expect(w.price + w.rating + w.distance + w.amenities).toBeCloseTo(1, 12);
    expect(w.price).toBeCloseTo(0.75, 12);
    expect(normaliseWeights({ price: 0, rating: 0, distance: 0, amenities: 0 }).price).toBe(0.25);
  });
});

describe("rank", () => {
  const set = [
    make(1, { price: 100 }),
    make(2, { price: 220, rating: 4.9, reviewCount: 300 }),
    make(3, { price: 160, lat: 52.32, lon: 4.80, amenities: ["Wifi", "Kitchen"] }),
    make(4, { price: 130, rating: null, reviewCount: 0 }),
  ];

  it("splits every score exactly into its feature contributions", () => {
    for (const r of rank(set, prefs)) {
      const sum = r.contributions.price + r.contributions.rating + r.contributions.distance + r.contributions.amenities;
      expect(sum).toBeCloseTo(r.score, 12);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it("is monotone in price: a cheaper copy never scores lower", () => {
    const a = make(10, { price: 120 }), b = make(11, { price: 180 });
    const out = rank([a, b, ...set], prefs);
    const sa = out.find((r) => r.listing.id === 10)!.score;
    const sb = out.find((r) => r.listing.id === 11)!.score;
    expect(sa).toBeGreaterThan(sb);
  });

  it("orders by price alone when only the price weight is set", () => {
    const out = rank(set, { ...prefs, weights: { price: 1, rating: 0, distance: 0, amenities: 0 } });
    expect(out.map((r) => r.listing.price)).toEqual([100, 130, 160, 220]);
  });

  it("does not change the order when all weights are scaled", () => {
    const a = rank(set, prefs).map((r) => r.listing.id);
    const b = rank(set, { ...prefs, weights: { price: 7, rating: 7, distance: 7, amenities: 7 } }).map((r) => r.listing.id);
    expect(a).toEqual(b);
  });

  it("is deterministic for ties, so pagination is stable", () => {
    const twins = [make(5, {}), make(3, {}), make(9, {})];
    expect(rank(twins, prefs).map((r) => r.listing.id)).toEqual([3, 5, 9]);
  });

  it("handles an empty set and a single listing", () => {
    expect(rank([], prefs)).toEqual([]);
    const [only] = rank([base], prefs);
    expect(only!.features.price).toBe(1);
  });
});
