import React from 'react';

/**
 * Juzgo pin mark — a location-pin head standing on a small ground disc,
 * with a blue accent dot standing in for the eSIM connectivity signal.
 * (July 2026 mark refresh — earlier globe artwork replaced.)
 * size: pixel width (default 44) — height follows the icon's fixed
 * aspect ratio automatically.
 * variant: 'colour' (default, green pin + blue dot) | 'white' (knockout
 * for dark/frosted backgrounds)
 */
export default function GlobeLogo({ size = 44, variant = 'colour' }) {
  const isWhite = variant === 'white';
  const pinColor = isWhite ? '#FFFFFF' : '#1E8E5E';
  const dotColor = isWhite ? '#FFFFFF' : '#2A6FDB';
  const discFill = isWhite ? 'rgba(255,255,255,0.25)' : '#CDE6D8';
  const height = size * (40 / 44);

  return (
    <svg width={size} height={height} viewBox="0 0 44 40" fill="none">
      {/* Ground disc the pin stands on */}
      <path d="M6 35 A16 5 0 0 0 38 35 L38 37 A16 5 0 0 1 6 37 Z" fill={discFill} />
      <ellipse cx="22" cy="35" rx="16" ry="5" fill="none" stroke={pinColor} strokeWidth="1" opacity="0.5" />
      {/* Pin tip */}
      <path d="M14.5 20.7 L22 31.2 L29.5 20.7 Z" fill={pinColor} />
      {/* Pin head with a genuine punched-through hole (evenodd), so it
          reads correctly on any background instead of matching a fixed fill */}
      <path
        fillRule="evenodd"
        d="M22 16.2 m-8.7 0 a8.7 8.7 0 1 0 17.4 0 a8.7 8.7 0 1 0 -17.4 0
           M22 15.2 m-3.2 0 a3.2 3.2 0 1 0 6.4 0 a3.2 3.2 0 1 0 -6.4 0"
        fill={pinColor}
      />
      {/* Signal dot */}
      <circle cx="30.5" cy="6.7" r="2.8" fill={dotColor} />
    </svg>
  );
}
