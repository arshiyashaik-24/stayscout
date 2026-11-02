/**
 * Search state lives in the URL, so any search can be bookmarked or shared
 * and the back button behaves. This module converts between the URL and a
 * typed state object, and builds the API query from it.
 */
import { useCallback, useEffect, useState } from "react";

export interface SearchState {
  guests: number;
  maxPrice: number | null;
  minRating: number | null;
  neighbourhoods: string[];
  roomTypes: string[];
  amenities: string[]; // nice to have: affects ranking
  require: string[]; // must have: filters
  anchor: string;
  wPrice: number;
  wRating: number;
  wDistance: number;
  wAmenities: number;
}

export const DEFAULTS: SearchState = {
  guests: 2, maxPrice: null, minRating: null, neighbourhoods: [], roomTypes: [], amenities: [], require: [],
  anchor: "centraal", wPrice: 3, wRating: 3, wDistance: 2, wAmenities: 1,
};

const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);
const num = (v: string | null, fallback: number) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : fallback);
const optNum = (v: string | null) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export function fromUrl(search: string): SearchState {
  const p = new URLSearchParams(search);
  return {
    guests: num(p.get("guests"), DEFAULTS.guests),
    maxPrice: optNum(p.get("maxPrice")),
    minRating: optNum(p.get("minRating")),
    neighbourhoods: list(p.get("neighbourhoods")),
    roomTypes: list(p.get("roomTypes")),
    amenities: list(p.get("amenities")),
    require: list(p.get("require")),
    anchor: p.get("anchor") ?? DEFAULTS.anchor,
    wPrice: num(p.get("wPrice"), DEFAULTS.wPrice),
    wRating: num(p.get("wRating"), DEFAULTS.wRating),
    wDistance: num(p.get("wDistance"), DEFAULTS.wDistance),
    wAmenities: num(p.get("wAmenities"), DEFAULTS.wAmenities),
  };
}

/** Only non-default values go into the URL, which keeps shared links short. */
export function toParams(s: SearchState): URLSearchParams {
  const p = new URLSearchParams();
  (Object.keys(DEFAULTS) as (keyof SearchState)[]).forEach((k) => {
    const v = s[k];
    const d = DEFAULTS[k];
    if (Array.isArray(v)) { if (v.length) p.set(k, v.join(",")); }
    else if (v !== null && v !== d) p.set(k, String(v));
  });
  return p;
}

export function useSearchState() {
  const [state, setState] = useState<SearchState>(() => fromUrl(window.location.search));

  useEffect(() => {
    const onPop = () => setState(fromUrl(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback((patch: Partial<SearchState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      const qs = toParams(next).toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
      return next;
    });
  }, []);

  const reset = useCallback(() => update(DEFAULTS), [update]);
  return { state, update, reset };
}
