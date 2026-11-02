/** Integration tests: real Fastify app, real SQLite (in memory), real seeded data. */
import { beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { openDb } from "../src/db";

let app: FastifyInstance;
beforeAll(async () => {
  app = buildApp(openDb(":memory:"));
  await app.ready();
});

const get = (url: string) => app.inject({ method: "GET", url });

describe("GET /api/listings", () => {
  it("returns ranked results with a breakdown that sums to the score", async () => {
    const res = await get("/api/listings?guests=2&limit=10");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(10);
    for (let i = 1; i < body.items.length; i++) expect(body.items[i - 1].score).toBeGreaterThanOrEqual(body.items[i].score);
    for (const it of body.items) {
      const sum = Object.values(it.contributions as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(it.score, 3);
    }
  });

  it("applies every hard filter", async () => {
    const body = (await get("/api/listings?guests=4&maxPrice=300&minRating=4.5&neighbourhoods=De%20Pijp,Oost&require=Kitchen,Washer&limit=50")).json();
    expect(body.total).toBeGreaterThan(0);
    for (const it of body.items) {
      expect(it.accommodates).toBeGreaterThanOrEqual(4);
      expect(it.price).toBeLessThanOrEqual(300);
      expect(it.rating).toBeGreaterThanOrEqual(4.5);
      expect(["De Pijp", "Oost"]).toContain(it.neighbourhood);
      expect(it.amenities).toEqual(expect.arrayContaining(["Kitchen", "Washer"]));
    }
  });

  it("paginates with a cursor: every result exactly once, in order", async () => {
    const all = (await get("/api/listings?guests=6&limit=50")).json();
    const seen: number[] = [];
    let cursor: string | null = "";
    while (cursor !== null) {
      const page: { items: { id: number }[]; nextCursor: string | null } =
        (await get(`/api/listings?guests=6&limit=7${cursor ? `&cursor=${cursor}` : ""}`)).json();
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(all.total);
    expect(new Set(seen).size).toBe(seen.length);
    if (all.total <= 50) expect(seen).toEqual(all.items.map((i: { id: number }) => i.id));
  });

  it("puts nearby listings first when only distance matters", async () => {
    const body = (await get("/api/listings?wPrice=0&wRating=0&wAmenities=0&wDistance=1&anchor=rai&limit=20")).json();
    const d = body.items.map((i: { distanceKm: number }) => i.distanceKm);
    expect(d).toEqual([...d].sort((a: number, b: number) => a - b));
  });

  it("returns an empty page, not an error, when nothing matches", async () => {
    const body = (await get("/api/listings?guests=16")).json();
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it.each([
    ["guests=0", "guests"],
    ["minRating=7", "minRating"],
    ["wPrice=-1", "wPrice"],
    ["anchor=moon", "anchor"],
    ["cursor=notacursor", "cursor"],
  ])("rejects invalid input (%s) with a 400 naming the field", async (qs, field) => {
    const res = await get(`/api/listings?${qs}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain(field);
  });
});

describe("listings and shortlists", () => {
  it("gets one listing and 404s for an unknown id", async () => {
    expect((await get("/api/listings/1")).json().id).toBe(1);
    expect((await get("/api/listings/999999")).statusCode).toBe(404);
  });

  it("round-trips a shortlist in the order it was saved", async () => {
    const created = await app.inject({ method: "POST", url: "/api/shortlists", payload: { listingIds: [5, 2, 9], note: "Weekend in May" } });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    const s = (await get(`/api/shortlists/${id}`)).json();
    expect(s.note).toBe("Weekend in May");
    expect(s.listings.map((l: { id: number }) => l.id)).toEqual([5, 2, 9]);
  });

  it("rejects shortlists with unknown or no listings", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/shortlists", payload: { listingIds: [1, 999999] } });
    expect(bad.statusCode).toBe(400);
    const empty = await app.inject({ method: "POST", url: "/api/shortlists", payload: { listingIds: [] } });
    expect(empty.statusCode).toBe(400);
    expect((await get("/api/shortlists/doesnotexist")).statusCode).toBe(404);
  });
});
