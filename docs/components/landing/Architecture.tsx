import React from 'react';

export function Architecture() {
  return (
    <section className="architecture-section">
      <div className="architecture-container">
        <h2 className="architecture-title">Clean Architecture</h2>
        <p className="architecture-subtitle">
          Mimir follows a layered architecture with clear separation of concerns
        </p>

        <div className="architecture-diagram">
          <div className="architecture-layer">
            <div className="layer-title">CLI & UI Layer</div>
            <div className="layer-subtitle">Commander, Ink Components</div>
          </div>

          <div className="architecture-layer">
            <div className="layer-title">Core Agent Layer</div>
            <div className="layer-subtitle">ReAct Loop, Tools, Memory</div>
          </div>

          <div className="architecture-layer">
            <div className="layer-title">Provider Layer</div>
            <div className="layer-subtitle">LLM Providers, MCP Clients</div>
          </div>

          <div className="architecture-layer">
            <div className="layer-title">Platform Abstraction Layer</div>
            <div className="layer-subtitle">IFileSystem, IProcessExecutor</div>
          </div>
        </div>
      </div>
    </section>
  );
}
