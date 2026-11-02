/**
 * Synthetic Amsterdam listings.
 *
 * Real open datasets cannot be downloaded in the environment this project was
 * built in, so this generator produces a realistic, clearly synthetic dataset:
 * real neighbourhood names with approximate centres, prices that fall with
 * distance from the centre and rise with size, and ratings with realistic
 * review counts. It is seeded, so every run produces the same data.
 */
import type { Listing } from "@stayscout/ranking";

export const NEIGHBOURHOODS: { name: string; lat: number; lon: number; premium: number }[] = [
  { name: "Centrum-West", lat: 52.3765, lon: 4.8870, premium: 1.35 },
  { name: "Centrum-Oost", lat: 52.3670, lon: 4.9050, premium: 1.3 },
  { name: "Jordaan", lat: 52.3750, lon: 4.8810, premium: 1.3 },
  { name: "De Pijp", lat: 52.3540, lon: 4.8940, premium: 1.15 },
  { name: "Oud-West", lat: 52.3660, lon: 4.8660, premium: 1.1 },
  { name: "Westerpark", lat: 52.3860, lon: 4.8700, premium: 1.0 },
  { name: "Oost", lat: 52.3600, lon: 4.9300, premium: 0.95 },
  { name: "Zuid", lat: 52.3460, lon: 4.8700, premium: 1.05 },
  { name: "Noord", lat: 52.3950, lon: 4.9200, premium: 0.85 },
  { name: "Nieuw-West", lat: 52.3650, lon: 4.8100, premium: 0.75 },
];

export const ANCHORS: Record<string, { label: string; lat: number; lon: number }> = {
  centraal: { label: "Amsterdam Centraal", lat: 52.3791, lon: 4.9003 },
  rijksmuseum: { label: "Rijksmuseum", lat: 52.36, lon: 4.8852 },
  rai: { label: "RAI Convention Centre", lat: 52.3409, lon: 4.8888 },
  zuidas: { label: "Zuidas business district", lat: 52.3383, lon: 4.8722 },
};

export const AMENITIES = ["Wifi", "Kitchen", "Washer", "Workspace", "Elevator", "Bike storage", "Balcony", "Air conditioning"];

/** Small, fast, seeded PRNG (mulberry32). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJ = ["Bright", "Cosy", "Canal-view", "Quiet", "Modern", "Spacious", "Charming", "Light-filled", "Stylish", "Compact"];
const NOUN = ["studio", "loft", "apartment", "room", "houseboat", "flat", "attic", "suite"];

export function generateListings(n = 1200, seed = 42): Listing[] {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const out: Listing[] = [];
  for (let id = 1; id <= n; id++) {
    const nb = NEIGHBOURHOODS[Math.floor(r() * NEIGHBOURHOODS.length)]!;
    const roomRoll = r();
    const roomType: Listing["roomType"] = roomRoll < 0.72 ? "Entire home" : roomRoll < 0.96 ? "Private room" : "Shared room";
    const bedrooms = roomType === "Entire home" ? 1 + Math.floor(r() * r() * 4) : 1;
    const accommodates = roomType === "Entire home" ? Math.min(8, bedrooms * 2 + (r() < 0.4 ? 1 : 0)) : roomType === "Private room" ? 1 + Math.floor(r() * 2) : 1;
    const base = roomType === "Entire home" ? 115 + 55 * bedrooms : roomType === "Private room" ? 75 : 40;
    const price = Math.max(35, Math.round(base * nb.premium * Math.exp(0.22 * gauss())));
    const reviewCount = r() < 0.08 ? 0 : Math.floor(Math.exp(1 + 4.2 * r()));
    const rating = reviewCount === 0 ? null : Math.round(Math.min(5, Math.max(3.2, 4.65 + 0.25 * gauss())) * 100) / 100;
    const amenities = AMENITIES.filter((a, i) => r() < [0.97, 0.85, 0.55, 0.45, 0.2, 0.35, 0.3, 0.12][i]!);
    out.push({
      id,
      name: `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]} in ${nb.name}`,
      neighbourhood: nb.name,
      lat: Math.round((nb.lat + 0.006 * gauss()) * 1e5) / 1e5,
      lon: Math.round((nb.lon + 0.009 * gauss()) * 1e5) / 1e5,
      price, accommodates, bedrooms, roomType, rating, reviewCount, amenities,
    });
  }
  return out;
}
