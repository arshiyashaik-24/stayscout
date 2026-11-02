import type { Meta } from "../api";
import type { SearchState } from "../searchState";

interface Props {
  meta: Meta;
  state: SearchState;
  update: (p: Partial<SearchState>) => void;
  reset: () => void;
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

const WEIGHTS: { key: "wPrice" | "wRating" | "wDistance" | "wAmenities"; label: string; hint: string }[] = [
  { key: "wPrice", label: "Price", hint: "cheaper ranks higher" },
  { key: "wRating", label: "Reviews", hint: "well-reviewed ranks higher" },
  { key: "wDistance", label: "Distance", hint: "closer ranks higher" },
  { key: "wAmenities", label: "Amenities", hint: "more of your nice-to-haves" },
];

export function Controls({ meta, state, update, reset }: Props) {
  return (
    <form className="controls" onSubmit={(e) => e.preventDefault()} aria-label="Search filters">
      <fieldset>
        <legend>Trip</legend>
        <label className="field">
          <span>Guests</span>
          <input id="guests" type="number" min={1} max={16} value={state.guests}
            onChange={(e) => update({ guests: Math.max(1, Math.min(16, Number(e.target.value) || 1)) })} />
        </label>
        <label className="field">
          <span>Near</span>
          <select id="anchor" value={state.anchor} onChange={(e) => update({ anchor: e.target.value })}>
            {meta.anchors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Max price per night</span>
          <input id="maxPrice" type="number" min={meta.priceRange[0]} step={10} placeholder="Any"
            value={state.maxPrice ?? ""} onChange={(e) => update({ maxPrice: e.target.value ? Number(e.target.value) : null })} />
        </label>
        <label className="field">
          <span>Minimum rating</span>
          <select id="minRating" value={state.minRating ?? ""} onChange={(e) => update({ minRating: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Any</option>
            {[4, 4.5, 4.7, 4.9].map((r) => <option key={r} value={r}>{r.toFixed(1)}+</option>)}
          </select>
        </label>
      </fieldset>

      <fieldset>
        <legend>What matters to you</legend>
        <p className="hint">The ranking is a weighted average of these. Drag to change it and watch the order update.</p>
        {WEIGHTS.map((w) => (
          <label key={w.key} className="slider">
            <span className="slider-top"><span>{w.label}</span><span className="val">{state[w.key]}</span></span>
            <input id={w.key} type="range" min={0} max={5} step={1} value={state[w.key]}
              aria-describedby={`${w.key}-hint`} onChange={(e) => update({ [w.key]: Number(e.target.value) })} />
            <span id={`${w.key}-hint`} className="hint">{w.hint}</span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Amenities</legend>
        <p className="hint">Nice to have counts toward the score. Must have filters listings out.</p>
        <div className="amen-grid" role="group" aria-label="Amenities">
          <span className="amen-h" aria-hidden="true" />
          <span className="amen-h">Nice</span>
          <span className="amen-h">Must</span>
          {meta.amenityOptions.map((a) => (
            <div key={a} className="amen-row">
              <span>{a}</span>
              <input id={`want-${a}`} type="checkbox" aria-label={`${a}: nice to have`} checked={state.amenities.includes(a)}
                onChange={() => update({ amenities: toggle(state.amenities, a) })} />
              <input id={`need-${a}`} type="checkbox" aria-label={`${a}: must have`} checked={state.require.includes(a)}
                onChange={() => update({ require: toggle(state.require, a) })} />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Neighbourhoods</legend>
        <div className="chips">
          {meta.neighbourhoods.map((n) => (
            <button key={n.name} type="button" className={state.neighbourhoods.includes(n.name) ? "chip on" : "chip"}
              aria-pressed={state.neighbourhoods.includes(n.name)} onClick={() => update({ neighbourhoods: toggle(state.neighbourhoods, n.name) })}>
              {n.name}
            </button>
          ))}
        </div>
        <div className="chips">
          {meta.roomTypes.map((t) => (
            <button key={t} type="button" className={state.roomTypes.includes(t) ? "chip on" : "chip"}
              aria-pressed={state.roomTypes.includes(t)} onClick={() => update({ roomTypes: toggle(state.roomTypes, t) })}>
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      <button type="button" className="link" onClick={reset}>Reset all</button>
    </form>
  );
}
