'use client';

import React from 'react';

/** Same presentation mark as Studio's BrandLogo; className is needed by chat surfaces. */
export function BrandLogo({ size = 18, className }: { size?: number; className?: string }) {
  const titleId = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none"
      className={`block shrink-0 ${className ?? ''}`.trim()} role="img" aria-labelledby={titleId}>
      <title id={titleId}>Agente Videomaker</title>
      <rect x="8" y="18" width="84" height="64" rx="14" stroke="currentColor" strokeWidth="7" />
      <path d="M29 18V82M71 18V82" stroke="currentColor" strokeWidth="6" strokeOpacity="0.35" />
      <path d="M41 34.5C41 31.7 44.1 30 46.4 31.5L70.5 47C72.7 48.4 72.7 51.6 70.5 53L46.4 68.5C44.1 70 41 68.3 41 65.5V34.5Z" fill="var(--accent, #d7193f)" />
    </svg>
  );
}
