"use client";
// Shown instead of a blank "Application error" page when something goes wrong on a page.
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = /server action|failed to fetch|loading chunk|ChunkLoadError/i.test(error.message);
  return (
    <section className="panel" style={{ maxWidth: 620 }}>
      <header><h2>Something went wrong</h2></header>
      <div className="body">
        {stale
          ? <p style={{ margin: 0 }}>The app was updated while this page was open. Reload the page and try again.</p>
          : <p style={{ margin: 0 }}>Nothing has been saved from the action that failed. Try again; if it happens again, send a screenshot of this box to the administrator.</p>}
        <p className="mono muted" style={{ margin: 0, fontSize: 12, wordBreak: "break-word" }}>{error.message}{error.digest ? ` · ref ${error.digest}` : ""}</p>
        <div className="toolbar">
          <button className="btn primary" onClick={() => window.location.reload()}>Reload page</button>
          <button className="btn" onClick={() => reset()}>Try again</button>
        </div>
      </div>
    </section>
  );
}
