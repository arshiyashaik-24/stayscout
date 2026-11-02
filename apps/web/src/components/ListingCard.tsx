import type { RankedItem } from "../api";
import { FEATURE_LABEL, ScoreBar } from "./ScoreBar";
import type { Feature } from "@stayscout/ranking";

interface Props {
  item: RankedItem;
  rankNo: number;
  anchorLabel: string;
  shortlisted: boolean;
  onToggle: (id: number) => void;
}

/** The single biggest reason this listing ranks where it does, in words. */
function topReason(item: RankedItem): string {
  const best = (Object.entries(item.contributions) as [Feature, number][]).sort((a, b) => b[1] - a[1])[0];
  if (!best) return "";
  const [f] = best;
  if (f === "price") return "strong on price";
  if (f === "rating") return "strong reviews";
  if (f === "distance") return "close to your point";
  return `has ${item.amenities.length} amenities you value`;
}

export function ListingCard({ item, rankNo, anchorLabel, shortlisted, onToggle }: Props) {
  return (
    <article className="card" aria-labelledby={`l-${item.id}`}>
      <div className="card-main">
        <div className="card-head">
          <span className="rank" aria-label={`Rank ${rankNo}`}>{rankNo}</span>
          <div className="title-block">
            <h3 id={`l-${item.id}`}>{item.name}</h3>
            <p className="sub">
              {item.roomType} · up to {item.accommodates} guests · {item.bedrooms} bedroom{item.bedrooms > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <dl className="facts">
          <div><dt>Price</dt><dd>€{item.price}<span className="unit"> / night</span></dd></div>
          <div>
            <dt>Rating</dt>
            <dd>
              {item.rating === null ? "No reviews" : <>{item.rating.toFixed(2)} <span className="unit">({item.reviewCount})</span></>}
            </dd>
          </div>
          <div><dt>Distance</dt><dd>{item.distanceKm.toFixed(1)} km<span className="unit"> to {anchorLabel}</span></dd></div>
        </dl>
        <p className="amen">{item.amenities.join(" · ") || "No listed amenities"}</p>
      </div>
      <div className="card-side">
        <div className="score"><span className="score-num">{Math.round(item.score * 100)}</span><span className="unit">/100</span></div>
        <ScoreBar contributions={item.contributions} />
        <p className="why">{topReason(item)}</p>
        <details className="explain">
          <summary>Why this score</summary>
          <table>
            <thead><tr><th>Factor</th><th className="num">Fit</th><th className="num">Points</th></tr></thead>
            <tbody>
              {(Object.keys(item.contributions) as Feature[]).map((f) => (
                <tr key={f}>
                  <td>{FEATURE_LABEL[f]}</td>
                  <td className="num">{Math.round(item.features[f] * 100)}%</td>
                  <td className="num">{(item.contributions[f] * 100).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {item.rating !== null && (
            <p className="note">Adjusted rating {item.adjustedRating.toFixed(2)}: ratings with few reviews are pulled toward the average.</p>
          )}
        </details>
        <button type="button" className={shortlisted ? "btn on" : "btn"} aria-pressed={shortlisted} onClick={() => onToggle(item.id)}>
          {shortlisted ? "On shortlist" : "Add to shortlist"}
        </button>
      </div>
    </article>
  );
}
