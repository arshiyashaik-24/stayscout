/**
 * REST API.
 *
 *   GET  /api/meta                 filter options and dataset summary
 *   GET  /api/listings             filtered, ranked, cursor-paginated results with score breakdowns
 *   GET  /api/listings/:id         one listing
 *   POST /api/shortlists           save a shortlist, returns an unguessable id for a share link
 *   GET  /api/shortlists/:id       a saved shortlist
 *
 * Every input is validated with zod; invalid input gets a 400 with a message
 * that says which field is wrong.
 */
import Fastify, { type FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { rank, type Weights } from "@stayscout/ranking";
import { createShortlist, findCandidates, getListing, getShortlist, meta, openDb, type Db } from "./db";
import { AMENITIES, ANCHORS } from "./data";

const csv = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []));
const weight = z.coerce.number().min(0).max(10).default(1);

const ListingsQuery = z.object({
  guests: z.coerce.number().int().min(1).max(16).default(2),
  maxPrice: z.coerce.number().positive().optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  neighbourhoods: csv,
  roomTypes: csv,
  amenities: csv, // wanted (soft, used for ranking)
  require: csv, // required (hard filter)
  anchor: z.string().default("centraal"),
  wPrice: weight, wRating: weight, wDistance: weight, wAmenities: weight,
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

const ShortlistBody = z.object({
  listingIds: z.array(z.number().int().positive()).min(1).max(50),
  note: z.string().max(500).optional(),
});

/** Opaque cursor: the position in the ranked list. Stable because ranking is deterministic. */
const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ o: offset })).toString("base64url");
function decodeCursor(c: string | undefined): number {
  if (!c) return 0;
  try {
    const o = JSON.parse(Buffer.from(c, "base64url").toString()).o;
    if (Number.isInteger(o) && o >= 0) return o;
  } catch { /* fall through */ }
  throw new BadRequest("cursor is invalid");
}

class BadRequest extends Error {}

function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
}

export function buildApp(db: Db = openDb()): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BadRequest) return reply.code(400).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: zodMessage(err) });
    if ((err as { statusCode?: number }).statusCode === 400) return reply.code(400).send({ error: err.message });
    app.log.error(err);
    return reply.code(500).send({ error: "Something went wrong on the server." });
  });

  app.get("/api/meta", async () => ({
    ...meta(db),
    anchors: Object.entries(ANCHORS).map(([id, a]) => ({ id, ...a })),
    roomTypes: ["Entire home", "Private room", "Shared room"],
    amenityOptions: AMENITIES,
  }));

  app.get("/api/listings", async (req) => {
    const q = ListingsQuery.parse(req.query);
    const anchor = ANCHORS[q.anchor];
    if (!anchor) throw new BadRequest(`anchor must be one of: ${Object.keys(ANCHORS).join(", ")}`);
    const offset = decodeCursor(q.cursor);

    const candidates = findCandidates(db, {
      guests: q.guests, maxPrice: q.maxPrice, minRating: q.minRating,
      neighbourhoods: q.neighbourhoods, roomTypes: q.roomTypes, requiredAmenities: q.require,
    });
    const weights: Weights = { price: q.wPrice, rating: q.wRating, distance: q.wDistance, amenities: q.wAmenities };
    const ranked = rank(candidates, { weights, anchor, wantedAmenities: q.amenities });
    const page = ranked.slice(offset, offset + q.limit);
    const next = offset + q.limit < ranked.length ? encodeCursor(offset + q.limit) : null;

    return {
      total: ranked.length,
      nextCursor: next,
      anchor: { id: q.anchor, ...anchor },
      items: page.map((r) => ({
        ...r.listing,
        score: round(r.score, 4),
        features: mapValues(r.features, (v) => round(v, 4)),
        contributions: mapValues(r.contributions, (v) => round(v, 4)),
        distanceKm: round(r.distanceKm, 2),
        adjustedRating: round(r.adjustedRating, 2),
      })),
    };
  });

  app.get("/api/listings/:id", async (req, reply) => {
    const { id } = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const l = getListing(db, id);
    return l ?? reply.code(404).send({ error: `No listing with id ${id}.` });
  });

  app.post("/api/shortlists", async (req, reply) => {
    const body = ShortlistBody.parse(req.body);
    const ids = [...new Set(body.listingIds)];
    const missing = ids.filter((id) => !getListing(db, id));
    if (missing.length) throw new BadRequest(`Unknown listing ids: ${missing.join(", ")}`);
    const id = randomBytes(8).toString("base64url"); // ~64 bits: unguessable share link
    createShortlist(db, id, ids, body.note);
    return reply.code(201).send({ id });
  });

  app.get("/api/shortlists/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{6,32}$/) }).parse(req.params);
    const s = getShortlist(db, id);
    return s ?? reply.code(404).send({ error: "This shortlist does not exist." });
  });

  return app;
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;
function mapValues<K extends string>(o: Record<K, number>, f: (v: number) => number): Record<K, number> {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v as number)])) as Record<K, number>;
}
