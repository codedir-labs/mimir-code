import React, { useState } from 'react';
import { PROJECT_NAME } from '@/lib/constants';

export function Hero() {
  const [activeTab, setActiveTab] = useState<'linux' | 'macos' | 'windows' | 'npm'>('linux');

  const installCommands = {
    linux: 'curl -fsSL https://raw.githubusercontent.com/codedir-labs/mimir-code/main/scripts/install.sh | bash',
    macos: 'curl -fsSL https://raw.githubusercontent.com/codedir-labs/mimir-code/main/scripts/install.sh | bash',
    windows: 'iwr -useb https://raw.githubusercontent.com/codedir-labs/mimir-code/main/scripts/install.ps1 | iex',
    npm: 'npm install -g @codedir/mimir-code',
  };

  return (
    <section className="hero-section">
      <div className="hero-container">
        <div className="hero-content">
          <div className="hero-wip-badge">Work in Progress</div>

          <h1 className="hero-title">{PROJECT_NAME}</h1>

          <p className="hero-description">Open source, model agnostic CLI tool for agentic work</p>

          <div className="hero-install">
            <div className="install-tabs">
              <button
                className={`install-tab ${activeTab === 'linux' ? 'active' : ''}`}
                onClick={() => setActiveTab('linux')}
              >
                Linux
              </button>
              <button
                className={`install-tab ${activeTab === 'macos' ? 'active' : ''}`}
                onClick={() => setActiveTab('macos')}
              >
                macOS
              </button>
              <button
                className={`install-tab ${activeTab === 'windows' ? 'active' : ''}`}
                onClick={() => setActiveTab('windows')}
              >
                Windows
              </button>
              <button
                className={`install-tab ${activeTab === 'npm' ? 'active' : ''}`}
                onClick={() => setActiveTab('npm')}
              >
                npm
              </button>
            </div>
            <div className="install-command">
              <code>{installCommands[activeTab]}</code>
              <button
                className="copy-button"
                onClick={() => void navigator.clipboard.writeText(installCommands[activeTab])}
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
