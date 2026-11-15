"use client";

import { useId } from "react";

const COBALT = "#1f4f8f";
const DEEP = "#163a6c";
const GLAZE = "#f7f1e6";
const CLAY = "#e7d3b8";

function Petalos() {
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

function Hoja() {
  return (
    <g>
      <path d="M2 18C16 2 44 1 58 14C46 28 18 32 2 18Z" fill={COBALT} />
      <path d="M8 18C22 14 40 12 52 14" fill="none" stroke={GLAZE} strokeWidth="1.3" strokeLinecap="round" opacity="0.8" />
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

export function Ramo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 118" aria-hidden="true">
      <path
        d="M16 108C30 78 46 66 70 46"
        fill="none"
        stroke={COBALT}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M70 46C84 32 90 20 84 8"
        fill="none"
        stroke={COBALT}
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <g transform="translate(22 78) rotate(-36) scale(0.72) translate(-8 -20)">
        <Hoja />
      </g>
      <g transform="translate(46 70) rotate(24) scale(-0.62 0.62) translate(-8 -18)">
        <Hoja />
      </g>
      <g transform="translate(78 36) rotate(-8) scale(0.48) translate(-6 -16)">
        <Hoja />
      </g>
      <g transform="translate(86 18) scale(0.58) translate(-32 -32)">
        <Petalos />
      </g>
      <circle cx="58" cy="58" r="1.5" fill={COBALT} />
      <circle cx="66" cy="50" r="1.1" fill={COBALT} />
    </svg>
  );
}

function scallops(count: number, radius: number, lift: number) {
  let d = "";
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / count) * Math.PI * 2 - Math.PI / 2;
    const mid = (a0 + a1) / 2;
    const x0 = 200 + Math.cos(a0) * radius;
    const y0 = 200 + Math.sin(a0) * radius;
    const x1 = 200 + Math.cos(a1) * radius;
    const y1 = 200 + Math.sin(a1) * radius;
    const mx = 200 + Math.cos(mid) * (radius + lift);
    const my = 200 + Math.sin(mid) * (radius + lift);
    d += `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

const OUTER_SCALLOP = scallops(26, 162, 15);
const INNER_SCALLOP = scallops(26, 126, 8);

function placed(angle: number, radius: number) {
  const a = (angle * Math.PI) / 180;
  return {
    x: (200 + Math.cos(a) * radius).toFixed(2),
    y: (200 + Math.sin(a) * radius).toFixed(2),
  };
}

export function Plato({ className }: { className?: string }) {
  const band = [18, 78, 138, 198, 258, 318];
  return (
    <svg className={className} viewBox="0 0 400 400" aria-hidden="true">
      <circle cx="200" cy="200" r="186" fill="#f8f3ea" />
      <circle cx="200" cy="200" r="176" fill="none" stroke={COBALT} strokeWidth="2.2" />
      <path d={OUTER_SCALLOP} fill="none" stroke={COBALT} strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="200" cy="200" r="118" fill="none" stroke={COBALT} strokeWidth="1.35" />
      <path d={INNER_SCALLOP} fill="none" stroke={COBALT} strokeWidth="1.15" strokeLinecap="round" opacity="0.85" />
      {band.map((angle, index) => {
        const spot = placed(angle, 146);
        if (index % 2 === 0) {
          return (
            <g key={angle} transform={`translate(${spot.x} ${spot.y}) rotate(${angle + 90}) scale(0.34) translate(-32 -32)`}>
              <Petalos />
            </g>
          );
        }
        return (
          <g key={angle} transform={`translate(${spot.x} ${spot.y}) rotate(${angle}) scale(0.42) translate(-16 -18)`}>
            <Hoja />
          </g>
        );
      })}
      {band.map((angle) => {
        const spot = placed(angle + 30, 164);
        return <circle key={`d-${angle}`} cx={spot.x} cy={spot.y} r="1.7" fill={COBALT} />;
      })}
      <g transform="translate(200 200) rotate(-20) scale(0.7) translate(-28 -18)">
        <Hoja />
      </g>
      <g transform="translate(200 200) rotate(58) scale(0.62) translate(-28 -16)">
        <Hoja />
      </g>
      <g transform="translate(200 200) rotate(150) scale(-0.66 0.66) translate(-26 -16)">
        <Hoja />
      </g>
      <g transform="translate(200 200) rotate(230) scale(0.55) translate(-24 -16)">
        <Hoja />
      </g>
      <g transform="translate(200 200) scale(0.92) translate(-32 -32)">
        <Petalos />
      </g>
      <g transform="translate(158 168) scale(0.34) translate(-32 -32)">
        <Petalos />
      </g>
      <g transform="translate(246 176) scale(0.3) translate(-32 -32)">
        <Petalos />
      </g>
      <circle cx="168" cy="214" r="1.6" fill={COBALT} />
      <circle cx="232" cy="206" r="1.4" fill={COBALT} />
    </svg>
  );
}

export function Cuenco({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 118" aria-hidden="true">
      <ellipse cx="80" cy="104" rx="34" ry="5.5" fill={CLAY} />
      <path
        d="M20 40C24 76 46 96 80 96C114 96 136 76 140 40Z"
        fill={GLAZE}
        stroke={COBALT}
        strokeWidth="2.15"
        strokeLinejoin="round"
      />
      <path d="M56 94C58 104 68 108 80 108C92 108 102 104 104 94" fill="#f3e7d6" stroke={COBALT} strokeWidth="2" />
      <g transform="translate(80 62) scale(0.42) translate(-32 -32)">
        <Petalos />
      </g>
      <g transform="translate(52 64) rotate(-28) scale(0.38) translate(-10 -16)">
        <Hoja />
      </g>
      <g transform="translate(108 66) rotate(20) scale(-0.36 0.36) translate(-10 -16)">
        <Hoja />
      </g>
      <ellipse cx="80" cy="40" rx="62" ry="14" fill="#fbf7f1" stroke={COBALT} strokeWidth="2.15" />
      <ellipse cx="80" cy="42" rx="42" ry="8" fill="#d5e3f4" stroke={COBALT} strokeWidth="1.35" />
      <path
        d="M42 36C58 32 102 32 118 37"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function Florero({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 180 250" aria-hidden="true">
      <ellipse cx="90" cy="226" rx="36" ry="7" fill={CLAY} />
      <path
        d="M62 34C58 58 46 70 42 88C32 118 26 150 40 182C52 208 74 218 90 218C106 218 128 208 140 182C154 150 148 118 138 88C134 70 122 58 118 34Z"
        fill={GLAZE}
        stroke={COBALT}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M68 214C72 224 80 228 90 228C100 228 108 224 112 214" fill="#f3e7d6" stroke={COBALT} strokeWidth="2" />
      <path
        d="M78 78C84 92 96 92 102 78"
        fill="none"
        stroke={COBALT}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <g transform="translate(90 142) scale(0.62) translate(-32 -32)">
        <Petalos />
      </g>
      <g transform="translate(58 128) rotate(-36) scale(0.5) translate(-8 -16)">
        <Hoja />
      </g>
      <g transform="translate(124 132) rotate(28) scale(-0.48 0.48) translate(-8 -16)">
        <Hoja />
      </g>
      <g transform="translate(70 112) scale(0.32) translate(-32 -32)">
        <Petalos />
      </g>
      <g transform="translate(112 158) scale(0.28) translate(-32 -32)">
        <Petalos />
      </g>
      <ellipse cx="90" cy="34" rx="32" ry="10" fill="#fbf7f1" stroke={COBALT} strokeWidth="2.2" />
      <ellipse cx="90" cy="36" rx="18" ry="5.5" fill="#d5e3f4" stroke={COBALT} strokeWidth="1.3" />
    </svg>
  );
}

export function Cenefa({ className }: { className?: string }) {
  const id = `cenefa${useId().replace(/:/g, "")}`;
  return (
    <svg className={className} aria-hidden="true">
      <defs>
        <pattern id={id} width="64" height="22" patternUnits="userSpaceOnUse">
          <path
            d="M0 3 A16 12 0 0 0 32 3 A16 12 0 0 0 64 3"
            fill="none"
            stroke={COBALT}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="32" cy="16" r="1.5" fill={COBALT} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
