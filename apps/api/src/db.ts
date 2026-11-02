/**
 * SQLite storage via Node's built-in `node:sqlite` (Node 22.5+), so the
 * project runs with no native build step and no database server.
 *
 * listings carries the filterable columns with indexes on the ones the API
 * filters by; amenities live in their own table so "has all of these" is a
 * proper relational query rather than string matching.
 */
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { Listing } from "@stayscout/ranking";
import { generateListings } from "./data";

// Loaded through require: Vite (used by the test runner) does not yet list
// node:sqlite among Node's built-ins and would try to bundle it.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export type Db = DatabaseSyncType;

export function openDb(path = ":memory:", seedListings: Listing[] = generateListings()): Db {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS listings (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      neighbourhood TEXT NOT NULL,
      lat REAL NOT NULL, lon REAL NOT NULL,
      price INTEGER NOT NULL CHECK (price > 0),
      accommodates INTEGER NOT NULL,
      bedrooms INTEGER NOT NULL,
      room_type TEXT NOT NULL,
      rating REAL,
      review_count INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_listings_filter ON listings (accommodates, price);
    CREATE INDEX IF NOT EXISTS idx_listings_nb ON listings (neighbourhood);
    CREATE TABLE IF NOT EXISTS listing_amenities (
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      amenity TEXT NOT NULL,
      PRIMARY KEY (listing_id, amenity)
    );
    CREATE TABLE IF NOT EXISTS shortlists (
      id TEXT PRIMARY KEY,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS shortlist_items (
      shortlist_id TEXT NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
      listing_id INTEGER NOT NULL REFERENCES listings(id),
      position INTEGER NOT NULL,
      PRIMARY KEY (shortlist_id, listing_id)
    );
  `);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM listings").get() as { n: number }).n;
  if (count === 0) seed(db, seedListings);
  return db;
}

function seed(db: Db, listings: Listing[]) {
  const ins = db.prepare(`INSERT INTO listings (id, name, neighbourhood, lat, lon, price, accommodates, bedrooms, room_type, rating, review_count)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insA = db.prepare("INSERT INTO listing_amenities (listing_id, amenity) VALUES (?, ?)");
  db.exec("BEGIN");
  for (const l of listings) {
    ins.run(l.id, l.name, l.neighbourhood, l.lat, l.lon, l.price, l.accommodates, l.bedrooms, l.roomType, l.rating, l.reviewCount);
    for (const a of l.amenities) insA.run(l.id, a);
  }
  db.exec("COMMIT");
}

interface Row {
  id: number; name: string; neighbourhood: string; lat: number; lon: number; price: number;
  accommodates: number; bedrooms: number; room_type: Listing["roomType"]; rating: number | null; review_count: number;
  amenities: string | null;
}

const SELECT = `SELECT l.*, (SELECT group_concat(amenity, '|') FROM listing_amenities a WHERE a.listing_id = l.id) AS amenities FROM listings l`;

function toListing(r: Row): Listing {
  return {
    id: r.id, name: r.name, neighbourhood: r.neighbourhood, lat: r.lat, lon: r.lon, price: r.price,
    accommodates: r.accommodates, bedrooms: r.bedrooms, roomType: r.room_type, rating: r.rating,
    reviewCount: r.review_count, amenities: r.amenities ? r.amenities.split("|").sort() : [],
  };
}

export interface Filters {
  guests: number;
  maxPrice?: number;
  minRating?: number;
  neighbourhoods: string[];
  roomTypes: string[];
  requiredAmenities: string[];
}

/** Candidate listings matching the hard filters, using parameterised SQL only. */
export function findCandidates(db: Db, f: Filters): Listing[] {
  const where: string[] = ["l.accommodates >= ?"];
  const params: (string | number)[] = [f.guests];
  if (f.maxPrice !== undefined) { where.push("l.price <= ?"); params.push(f.maxPrice); }
  if (f.minRating !== undefined) { where.push("l.rating >= ?"); params.push(f.minRating); }
  if (f.neighbourhoods.length) { where.push(`l.neighbourhood IN (${f.neighbourhoods.map(() => "?").join(",")})`); params.push(...f.neighbourhoods); }
  if (f.roomTypes.length) { where.push(`l.room_type IN (${f.roomTypes.map(() => "?").join(",")})`); params.push(...f.roomTypes); }
  if (f.requiredAmenities.length) {
    where.push(`(SELECT COUNT(*) FROM listing_amenities a WHERE a.listing_id = l.id AND a.amenity IN (${f.requiredAmenities.map(() => "?").join(",")})) = ?`);
    params.push(...f.requiredAmenities, f.requiredAmenities.length);
  }
  const rows = db.prepare(`${SELECT} WHERE ${where.join(" AND ")}`).all(...params) as unknown as Row[];
  return rows.map(toListing);
}

export function getListing(db: Db, id: number): Listing | undefined {
  const row = db.prepare(`${SELECT} WHERE l.id = ?`).get(id) as unknown as Row | undefined;
  return row ? toListing(row) : undefined;
}

export function createShortlist(db: Db, id: string, listingIds: number[], note?: string): void {
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO shortlists (id, note) VALUES (?, ?)").run(id, note ?? null);
    const ins = db.prepare("INSERT INTO shortlist_items (shortlist_id, listing_id, position) VALUES (?, ?, ?)");
    listingIds.forEach((lid, i) => ins.run(id, lid, i));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function getShortlist(db: Db, id: string): { id: string; note: string | null; listings: Listing[] } | undefined {
  const s = db.prepare("SELECT id, note FROM shortlists WHERE id = ?").get(id) as { id: string; note: string | null } | undefined;
  if (!s) return undefined;
  const rows = db.prepare(`${SELECT} JOIN shortlist_items i ON i.listing_id = l.id WHERE i.shortlist_id = ? ORDER BY i.position`).all(id) as unknown as Row[];
  return { id: s.id, note: s.note, listings: rows.map(toListing) };
}

export function meta(db: Db) {
  const p = db.prepare("SELECT MIN(price) AS lo, MAX(price) AS hi, COUNT(*) AS n FROM listings").get() as { lo: number; hi: number; n: number };
  const nbs = (db.prepare("SELECT neighbourhood AS name, COUNT(*) AS n FROM listings GROUP BY neighbourhood ORDER BY neighbourhood").all() as unknown as { name: string; n: number }[]);
  const am = (db.prepare("SELECT amenity AS name, COUNT(*) AS n FROM listing_amenities GROUP BY amenity ORDER BY n DESC").all() as unknown as { name: string; n: number }[]);
  return { priceRange: [p.lo, p.hi] as [number, number], count: p.n, neighbourhoods: nbs, amenities: am };
}
