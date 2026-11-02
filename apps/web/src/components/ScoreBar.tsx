import type { Feature } from "@stayscout/ranking";

export const FEATURE_LABEL: Record<Feature, string> = {
  price: "Price",
  rating: "Rating",
  distance: "Distance",
  amenities: "Amenities",
};
const ORDER: Feature[] = ["price", "rating", "distance", "amenities"];

/** Stacked bar showing how much each feature contributed to the total score (0-100). */
export function ScoreBar({ contributions }: { contributions: Record<Feature, number> }) {
  const parts = ORDER.map((f) => ({ f, v: contributions[f] * 100 }));
  const label = parts.map((p) => `${FEATURE_LABEL[p.f]} ${p.v.toFixed(0)}`).join(", ");
  return (
    <div className="scorebar" role="img" aria-label={`Score breakdown: ${label} out of 100`}>
      {parts.map((p) => (
        <span key={p.f} className={`seg seg-${p.f}`} style={{ width: `${p.v}%` }} title={`${FEATURE_LABEL[p.f]}: ${p.v.toFixed(1)} points`} />
      ))}
    </div>
  );
}

export function ScoreLegend() {
  return (
    <ul className="legend" aria-label="Score colours">
      {ORDER.map((f) => (
        <li key={f}><span className={`dot seg-${f}`} aria-hidden="true" />{FEATURE_LABEL[f]}</li>
      ))}
    </ul>
  );
}
