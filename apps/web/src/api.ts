import type { Feature, Listing } from "@stayscout/ranking";

export interface RankedItem extends Listing {
  score: number;
  features: Record<Feature, number>;
  contributions: Record<Feature, number>;
  distanceKm: number;
  adjustedRating: number;
}

export interface ListingsPage {
  total: number;
  nextCursor: string | null;
  anchor: { id: string; label: string };
  items: RankedItem[];
}

export interface Meta {
  count: number;
  priceRange: [number, number];
  neighbourhoods: { name: string; n: number }[];
  anchors: { id: string; label: string }[];
  roomTypes: string[];
  amenityOptions: string[];
}

export interface Shortlist { id: string; note: string | null; listings: Listing[] }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

export const api = {
  meta: () => request<Meta>("/api/meta"),
  listings: (params: URLSearchParams, signal?: AbortSignal) => request<ListingsPage>(`/api/listings?${params}`, { signal }),
  createShortlist: (listingIds: number[], note?: string) =>
    request<{ id: string }>("/api/shortlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingIds, note: note || undefined }),
    }),
  shortlist: (id: string) => request<Shortlist>(`/api/shortlists/${encodeURIComponent(id)}`),
};
