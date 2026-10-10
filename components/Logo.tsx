/* YELF logo: dark-text version on light backgrounds, white-text version in dark mode. */
export default function Logo({ width = 168 }: { width?: number }) {
  const h = Math.round(width * 373 / 900);
  return (
    <picture className="logo">
      <source srcSet="/logo-dark.png" media="screen and (prefers-color-scheme: dark)" />
      <img src="/logo-light.png" width={width} height={h} alt="YELF Business and Associates" />
    </picture>
  );
}
