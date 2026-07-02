import React from 'react';

/**
 * Coloured world globe SVG.
 * size: pixel size (default 44)
 * variant: 'colour' (default) | 'white' (white wireframe on transparent for dark backgrounds)
 */
export default function GlobeLogo({ size = 44, variant = 'colour' }) {
  const r = size / 2;
  const cx = r;
  const cy = r;
  const globeR = r * 0.86;

  if (variant === 'white') {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
        <circle cx={cx} cy={cy} r={globeR} stroke="#fff" strokeWidth="1.4" />
        <ellipse cx={cx} cy={cy} rx={globeR * 0.42} ry={globeR} stroke="#fff" strokeWidth="1" />
        <line x1={cx - globeR} y1={cy} x2={cx + globeR} y2={cy} stroke="#fff" strokeWidth="1" opacity="0.7" />
        <ellipse cx={cx} cy={cy * 0.65} rx={globeR * 0.82} ry={globeR * 0.22} stroke="#fff" strokeWidth="0.8" opacity="0.5" />
        <ellipse cx={cx} cy={cy * 1.35} rx={globeR * 0.82} ry={globeR * 0.22} stroke="#fff" strokeWidth="0.8" opacity="0.5" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 44 44">
      <defs>
        <clipPath id={`gc-${size}`}>
          <circle cx="22" cy="22" r="19" />
        </clipPath>
        <radialGradient id={`og-${size}`} cx="38%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#5BA4E5" />
          <stop offset="100%" stopColor="#1A5FAB" />
        </radialGradient>
      </defs>
      <circle cx="22" cy="22" r="19" fill={`url(#og-${size})`} />
      <g clipPath={`url(#gc-${size})`}>
        <ellipse cx="10" cy="18" rx="5" ry="8" fill="#4CAF7D" opacity="0.9" />
        <ellipse cx="11" cy="30" rx="4" ry="6" fill="#4CAF7D" opacity="0.85" />
        <ellipse cx="22" cy="16" rx="4" ry="5" fill="#6DBF82" opacity="0.9" />
        <ellipse cx="23" cy="27" rx="5" ry="8" fill="#5AAF72" opacity="0.85" />
        <ellipse cx="33" cy="15" rx="7" ry="6" fill="#4CAF7D" opacity="0.9" />
        <ellipse cx="35" cy="29" rx="4" ry="3" fill="#6DBF82" opacity="0.8" />
        <ellipse cx="22" cy="22" rx="6" ry="19" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
        <ellipse cx="22" cy="22" rx="13" ry="19" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
        <ellipse cx="22" cy="15" rx="16" ry="4" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.7" />
        <ellipse cx="22" cy="22" rx="19" ry="5" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.7" />
        <ellipse cx="22" cy="29" rx="16" ry="4" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="0.7" />
      </g>
      <ellipse cx="16" cy="14" rx="7" ry="5" fill="rgba(255,255,255,0.12)" />
      <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(42,111,219,0.4)" strokeWidth="1" />
    </svg>
  );
}
