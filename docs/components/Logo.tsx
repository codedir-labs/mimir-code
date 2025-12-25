import React from 'react';
import { MIMIR_LOGO_TEXT } from '@/lib/constants';

export function Logo() {
  return (
    <div className="logo-container">
      <span className="logo-text">{MIMIR_LOGO_TEXT}</span>
    </div>
  );
}
