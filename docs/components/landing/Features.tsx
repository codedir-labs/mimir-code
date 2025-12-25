import React from 'react';

const features = [
  {
    icon: '🌍',
    title: 'Cross-Platform',
    description: 'Full Windows, macOS, and Linux support with platform abstraction layer',
  },
  {
    icon: '🔑',
    title: 'Bring Your Own Key',
    description:
      'Support for 7+ LLM providers: DeepSeek, Anthropic, OpenAI, Google/Gemini, Qwen, Ollama',
  },
  {
    icon: '🔒',
    title: 'Security First',
    description: 'Permission system, Docker sandboxing, and comprehensive audit trails',
  },
  {
    icon: '🧪',
    title: 'Test-Driven',
    description: 'Built with Vitest, 80%+ test coverage target',
  },
  {
    icon: '🔌',
    title: 'MCP Integration',
    description: 'Model Context Protocol support for dynamic tool loading',
  },
  {
    icon: '🎨',
    title: 'Modern UI',
    description: 'Beautiful terminal UI built with Ink and React',
  },
];

export function Features() {
  return (
    <section className="features-section">
      <div className="features-container">
        <div className="features-header">
          <h2 className="features-title">Why Mimir?</h2>
          <p className="features-subtitle">
            Designed for developers who want control, security, and transparency
          </p>
        </div>

        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-icon">{feature.icon}</div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-description">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
