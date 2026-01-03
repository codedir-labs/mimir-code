import React from 'react';

interface LogoProps {
  size?: 'default' | 'hero';
}

export function Logo({ size = 'default' }: LogoProps) {
  const sizeClass = size === 'hero' ? 'logo-hero' : '';

  return (
    <div className={`logo-container ${sizeClass}`}>
      <span className="logo-text-mimir">Mimir</span>
      <span className="logo-text-code">Code</span>
    </div>
  );
}
