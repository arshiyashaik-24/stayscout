/**
 * Explainable ranking for accommodation search.
 *
 * Each listing gets four feature scores in [0, 1], normalised within the
 * current candidate set, and a total that is their weighted average. Because
 * the total is a weighted average, every listing's score splits exactly into
 * per-feature contributions, which the UI shows as the "why it ranks here"
 * breakdown.
 *
 *   price      cheaper is better (min-max over candidates)
 *   rating     Bayesian-adjusted rating, so 5.0 from 1 review does not beat
 *              4.8 from 500 reviews
 *   distance   closer to the chosen point is better (haversine distance)
 *   amenities  share of the requested amenities the listing has
 */

export type Feature = "price" | "rating" | "distance" | "amenities";
export const FEATURES: readonly Feature[] = ["price", "rating", "distance", "amenities"];

export interface Listing {
  id: number;
  name: string;
  neighbourhood: string;
  lat: number;
  lon: number;
  price: number; // EUR per night
  accommodates: number;
  bedrooms: number;
  roomType: "Entire home" | "Private room" | "Shared room";
  rating: number | null; // 0-5, null when there are no reviews
  reviewCount: number;
  amenities: string[];
}

export type Weights = Record<Feature, number>;

export interface Preferences {
  weights: Weights;
  anchor: { lat: number; lon: number };
  wantedAmenities: string[];
  /** Strength of the rating prior, in "virtual reviews" at the candidates' mean rating. */
  priorReviews?: number;
}

export interface Ranked {
  listing: Listing;
  score: number; // 0-1
  features: Record<Feature, number>; // 0-1 each
  contributions: Record<Feature, number>; // sums to score
  distanceKm: number;
  adjustedRating: number;
}

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bayesian average: (n R + m C) / (n + m). With no reviews it returns the prior mean C. */
export function adjustedRating(rating: number | null, reviewCount: number, priorMean: number, priorReviews: number): number {
  if (rating === null || reviewCount <= 0) return priorMean;
  return (reviewCount * rating + priorReviews * priorMean) / (reviewCount + priorReviews);
}

/** Normalise weights to sum to 1; all-zero (or negative) weights mean "treat features equally". */
export function normaliseWeights(w: Weights): Weights {
  const clean = FEATURES.map((f) => Math.max(0, Number.isFinite(w[f]) ? w[f] : 0));
  const total = clean.reduce((a, b) => a + b, 0);
  const out = {} as Weights;
  FEATURES.forEach((f, i) => (out[f] = total > 0 ? clean[i]! / total : 1 / FEATURES.length));
  return out;
}

/** Map values to [0, 1] with min-max scaling; `higherIsBetter=false` flips it. Equal values all get 1. */
function minMax(values: number[], higherIsBetter: boolean): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (!(hi > lo)) return values.map(() => 1);
  return values.map((v) => (higherIsBetter ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo)));
}

export function rank(listings: Listing[], prefs: Preferences): Ranked[] {
  if (listings.length === 0) return [];
  const w = normaliseWeights(prefs.weights);
  const m = prefs.priorReviews ?? 10;

  const rated = listings.filter((l) => l.rating !== null && l.reviewCount > 0);
  const priorMean = rated.length ? rated.reduce((s, l) => s + (l.rating as number), 0) / rated.length : 0;

  const dist = listings.map((l) => haversineKm(prefs.anchor, l));
  const adj = listings.map((l) => adjustedRating(l.rating, l.reviewCount, priorMean, m));
  const wanted = prefs.wantedAmenities.map((a) => a.toLowerCase());

  const f = {
    price: minMax(listings.map((l) => l.price), false),
    rating: minMax(adj, true),
    distance: minMax(dist, false),
    amenities: listings.map((l) => {
      if (wanted.length === 0) return 1;
      const have = new Set(l.amenities.map((a) => a.toLowerCase()));
      return wanted.filter((a) => have.has(a)).length / wanted.length;
    }),
  };

  const ranked = listings.map((listing, i): Ranked => {
    const features = { price: f.price[i]!, rating: f.rating[i]!, distance: f.distance[i]!, amenities: f.amenities[i]! };
    const contributions = {} as Record<Feature, number>;
    let score = 0;
    for (const k of FEATURES) {
      contributions[k] = w[k] * features[k];
      score += contributions[k];
    }
    return { listing, score, features, contributions, distanceKm: dist[i]!, adjustedRating: adj[i]! };
  });

  // Highest score first; ties broken by id so the order (and pagination) is deterministic.
  return ranked.sort((a, b) => b.score - a.score || a.listing.id - b.listing.id);
}
