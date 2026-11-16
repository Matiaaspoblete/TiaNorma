const COBALT = "#1f4f8f";
const DEEP = "#163a6c";
const GLAZE = "#f7f1e6";
const CLAY = "#e7d3b8";

export { CLAY, COBALT, GLAZE };

export function Petalos() {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse
          key={deg}
          cx="32"
          cy="14"
          rx="8.2"
          ry="13"
          fill={COBALT}
          transform={`rotate(${deg} 32 32)`}
        />
      ))}
      <circle cx="32" cy="32" r="7" fill={DEEP} />
      <circle cx="32" cy="32" r="3.1" fill="#2f6cb5" />
      <circle cx="30.4" cy="30.4" r="1.5" fill={GLAZE} />
    </g>
  );
}

export function Flor({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <Petalos />
    </svg>
  );
}
