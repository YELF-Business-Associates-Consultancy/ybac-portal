"use client";
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en-GB"><body style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 620 }}>
      <h2>Something went wrong</h2>
      <p>Reload the page and try again. If it keeps happening, send a screenshot of this page to the administrator.</p>
      <p style={{ fontFamily: "monospace", fontSize: 12, color: "#5A6A63", wordBreak: "break-word" }}>{error.message}{error.digest ? ` · ref ${error.digest}` : ""}</p>
      <button onClick={() => window.location.reload()} style={{ padding: "8px 14px" }}>Reload page</button>
    </body></html>
  );
}
