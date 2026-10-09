"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserDb } from "@/lib/supabase/client";

// Turn on once custom SMTP is set up and the email template includes {{ .Token }}.
const SHOW_CODE = false;

export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  async function send(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { error } = await browserDb().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setErr(/database error|not on the ybac member list/i.test(error.message)
        ? "That email isn't on the YBAC member list. Use the email the association has for you, or ask the administrator."
        : /rate limit/i.test(error.message) ? "Too many sign-in emails were sent just now. Wait a few minutes and try again." : error.message);
      return;
    }
    setSent(true);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const { error } = await browserDb().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) { setErr("That code didn't work. Check it, or use the link in the email instead."); return; }
    router.replace("/"); router.refresh();
  }

  return (
    <main className="login">
      <div className="card">
        <div className="brand"><b style={{ fontFamily: "var(--display)", fontSize: 34, fontWeight: 400 }}>YBAC</b>
          <span className="muted" style={{ fontSize: 12 }}>YELF Business Associates and Consultancy</span></div>
        {!sent ? (
          <form onSubmit={send} className="field" style={{ gap: 12 }}>
            <label htmlFor="email">Your email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="The email YBAC has on file" />
            <button className="btn primary" disabled={busy}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
            <p className="note" style={{ margin: 0 }}>No password needed. We email you a sign-in link each time you sign in.</p>
          </form>
        ) : (
          <form onSubmit={verify} className="field" style={{ gap: 12 }}>
            <p style={{ margin: 0 }}>We sent a sign-in email to <b>{email}</b>. Open the link in it <b>on this device, in this browser</b>. It works once and expires after an hour.</p>
            {SHOW_CODE && <>
            <label htmlFor="code">Code from the email</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" />
            <button className="btn primary" disabled={busy || code.trim().length < 6}>{busy ? "Checking…" : "Sign in"}</button></>}
            <button type="button" className="link" onClick={() => { setSent(false); setCode(""); }}>Use a different email</button>
          </form>
        )}
        {err && <p className="err" role="alert">{err}</p>}
      </div>
    </main>
  );
}
