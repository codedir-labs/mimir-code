import React from 'react';
import Link from 'next/link';

export function CTA() {
  return (
    <section className="cta-section">
      <div className="cta-container">
        <div className="cta-content">
          <h2 className="cta-title">Ready to Get Started?</h2>
          <p className="cta-description">
            Explore the documentation and learn how to use Mimir for your AI-powered development
            workflow.
          </p>
          <div className="cta-buttons">
            <Link href="/getting-started/installation" className="cta-button-primary">
              Install Mimir
            </Link>
            <Link href="/getting-started" className="cta-button-secondary">
              Read Documentation
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
