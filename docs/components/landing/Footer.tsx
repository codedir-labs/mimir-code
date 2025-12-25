import React from 'react';
import { useTheme } from 'next-themes';
import { ORG_NAME, GITHUB_URL } from '@/lib/constants';

export function LandingFooter() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <footer className="landing-footer">
      <div className="landing-footer-container">
        <div className="landing-footer-content">
          {/* Left - Copyright */}
          <div className="landing-footer-left">
            <p className="landing-footer-copyright">
              © {new Date().getFullYear()}{' '}
              <a
                href="https://github.com/codedir-labs"
                target="_blank"
                rel="noopener noreferrer"
                className="landing-footer-link"
              >
                {ORG_NAME}
              </a>
              . AGPL-3.0 License.
            </p>
          </div>

          {/* Center - Links */}
          <div className="landing-footer-center">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-footer-link"
            >
              GitHub
            </a>
            <span className="landing-footer-separator">·</span>
            <a
              href="/getting-started"
              className="landing-footer-link"
            >
              Documentation
            </a>
            <span className="landing-footer-separator">·</span>
            <a
              href={`${GITHUB_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-footer-link"
            >
              Issues
            </a>
          </div>

          {/* Right - Theme Toggle */}
          <div className="landing-footer-right">
            {mounted && (
              <button
                onClick={toggleTheme}
                className="landing-theme-toggle"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/>
                    <line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
