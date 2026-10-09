export default function Flash({ e, ok }: { e?: string; ok?: string }) {
  if (e) return <p className="err" role="alert">{e}</p>;
  if (ok) return <p className="okmsg" role="status">{ok}</p>;
  return null;
}
