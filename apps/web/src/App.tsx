import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ListingsPage, type Meta, type RankedItem, type Shortlist } from "./api";
import { toParams, useSearchState } from "./searchState";
import { Controls } from "./components/Controls";
import { ListingCard } from "./components/ListingCard";
import { ScoreLegend } from "./components/ScoreBar";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready" };

export default function App() {
  const sharedId = new URLSearchParams(window.location.search).get("shortlist");
  return sharedId ? <SharedShortlist id={sharedId} /> : <Search />;
}

function Search() {
  const { state, update, reset } = useSearchState();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [page, setPage] = useState<ListingsPage | null>(null);
  const [items, setItems] = useState<RankedItem[]>([]);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [moreLoading, setMoreLoading] = useState(false);
  const [shortlist, setShortlist] = useState<number[]>([]);
  const [share, setShare] = useState<{ status: "idle" | "saving" | "done" | "error"; url?: string; message?: string }>({ status: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { api.meta().then(setMeta).catch((e: Error) => setLoad({ status: "error", message: e.message })); }, []);

  // Fetch the first page whenever the search changes (debounced; stale requests are cancelled).
  useEffect(() => {
    const t = setTimeout(() => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      setLoad({ status: "loading" });
      api.listings(toParams(state), ctrl.signal)
        .then((p) => { setPage(p); setItems(p.items); setLoad({ status: "ready" }); })
        .catch((e: Error) => { if (e.name !== "AbortError") setLoad({ status: "error", message: e.message }); });
    }, 200);
    return () => clearTimeout(t);
  }, [state]);

  const loadMore = useCallback(() => {
    if (!page?.nextCursor) return;
    const p = toParams(state);
    p.set("cursor", page.nextCursor);
    setMoreLoading(true);
    api.listings(p)
      .then((next) => { setPage(next); setItems((prev) => [...prev, ...next.items]); })
      .catch((e: Error) => setLoad({ status: "error", message: e.message }))
      .finally(() => setMoreLoading(false));
  }, [page, state]);

  const toggleShortlist = (id: number) => {
    setShare({ status: "idle" });
    setShortlist((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const saveShortlist = async () => {
    setShare({ status: "saving" });
    try {
      const { id } = await api.createShortlist(shortlist);
      setShare({ status: "done", url: `${window.location.origin}${window.location.pathname}?shortlist=${id}` });
    } catch (e) {
      setShare({ status: "error", message: (e as Error).message });
    }
  };

  return (
    <div className="layout">
      <header className="top">
        <div className="brand">StayScout <span>Amsterdam</span></div>
        <p className="tag">Weight what matters to you and see why every stay ranks where it does.</p>
      </header>

      <aside className="side">
        {meta ? <Controls meta={meta} state={state} update={update} reset={reset} /> : <p className="muted">Loading filters…</p>}
      </aside>

      <main className="results" aria-live="polite">
        <div className="results-head">
          <p className="count">
            {load.status === "ready" && page ? <><b>{page.total.toLocaleString()}</b> stays for {state.guests} guest{state.guests > 1 ? "s" : ""}, ranked for you</> : " "}
          </p>
          <ScoreLegend />
        </div>

        {load.status === "error" && (
          <div className="notice error" role="alert">
            <b>Could not load results.</b> {load.message} Check that the API is running (<code>npm run dev:api</code>) and try again.
          </div>
        )}
        {load.status === "loading" && items.length === 0 && <div className="notice">Finding stays…</div>}
        {load.status === "ready" && page?.total === 0 && (
          <div className="notice">
            <b>No stays match all of your filters.</b> Try a higher price, fewer must-have amenities, or more neighbourhoods.
            <button type="button" className="link" onClick={reset}>Reset all filters</button>
          </div>
        )}

        <div className={load.status === "loading" ? "list dim" : "list"}>
          {items.map((it, i) => (
            <ListingCard key={it.id} item={it} rankNo={i + 1} anchorLabel={page?.anchor.label ?? ""}
              shortlisted={shortlist.includes(it.id)} onToggle={toggleShortlist} />
          ))}
        </div>

        {page?.nextCursor && load.status === "ready" && (
          <button type="button" className="btn wide" onClick={loadMore} disabled={moreLoading}>
            {moreLoading ? "Loading…" : `Show more (${page.total - items.length} left)`}
          </button>
        )}
      </main>

      {shortlist.length > 0 && (
        <div className="tray" role="region" aria-label="Shortlist">
          <span><b>{shortlist.length}</b> on your shortlist</span>
          {share.status === "done" && share.url ? (
            <span className="share">
              <input id="share-url" readOnly value={share.url} onFocus={(e) => e.target.select()} aria-label="Share link" />
              <button type="button" className="btn" onClick={() => navigator.clipboard?.writeText(share.url!).catch(() => undefined)}>Copy link</button>
            </span>
          ) : (
            <button type="button" className="btn" onClick={saveShortlist} disabled={share.status === "saving"}>
              {share.status === "saving" ? "Saving…" : "Create share link"}
            </button>
          )}
          {share.status === "error" && <span className="err">{share.message}</span>}
        </div>
      )}
    </div>
  );
}

function SharedShortlist({ id }: { id: string }) {
  const [data, setData] = useState<Shortlist | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.shortlist(id).then(setData).catch((e: Error) => setError(e.message)); }, [id]);
  return (
    <div className="layout single">
      <header className="top">
        <div className="brand">StayScout <span>Shared shortlist</span></div>
        <a className="link" href={window.location.pathname}>Start your own search</a>
      </header>
      <main className="results">
        {error && <div className="notice error" role="alert"><b>Could not open this shortlist.</b> {error}</div>}
        {!data && !error && <div className="notice">Loading shortlist…</div>}
        {data?.note && <p className="count">{data.note}</p>}
        <div className="list">
          {data?.listings.map((l, i) => (
            <article key={l.id} className="card compact">
              <div className="card-head">
                <span className="rank">{i + 1}</span>
                <div className="title-block">
                  <h3>{l.name}</h3>
                  <p className="sub">{l.neighbourhood} · {l.roomType} · up to {l.accommodates} guests</p>
                </div>
              </div>
              <dl className="facts">
                <div><dt>Price</dt><dd>€{l.price}<span className="unit"> / night</span></dd></div>
                <div><dt>Rating</dt><dd>{l.rating === null ? "No reviews" : `${l.rating.toFixed(2)} (${l.reviewCount})`}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
