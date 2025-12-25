import React from 'react';
import { PROJECT_NAME } from '@/lib/constants';

export function Hero() {
  return (
    <section className="hero-section">
      <div className="hero-container">
        <div className="hero-content">
          <div className="hero-wip-badge">
            Work in Progress
          </div>

          <h1 className="hero-title">
            {PROJECT_NAME}
          </h1>

          <p className="hero-description">
            Open source, model agnostic CLI tool for agentic work
          </p>
        </div>
      </div>
    </section>
  );
}
