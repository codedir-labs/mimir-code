# Sandboxing & Cloud-Based Context Management for Mimir

**Date**: 2025-12-28
**Status**: Architecture Design
**Related**: Phase 3 Multi-Agent Orchestration, Mimir Teams Architecture

---

## 🎯 Overview

This document defines Mimir's approach to:
1. **Sandboxed Agent Execution** - Isolated environments for agent code execution
2. **Cloud-Based Context Management** - Server-side context handling for Teams/Enterprise
3. **Security Model** - Permission system, allowlisting, and policy enforcement

Based on research of industry leaders:
- **Claude Code** - OS-level sandboxing + cloud VMs for enterprise
- **Docker Sandboxes** - Purpose-built containers for AI agents
- **OpenHands** - Docker-based sandbox with SSH access
- **General Best Practices** - Defense-in-depth security

---

## 📊 Research Summary

### Claude Code Approach

**Local Execution:**
- OS-level sandboxing using platform-specific primitives
  - Linux: [bubblewrap](https://github.com/containers/bubblewrap)
  - macOS: Seatbelt sandbox enforcement
  - Windows: Support planned
- Lightweight, no Docker overhead
- Filesystem restrictions (read anywhere, write only in project)

**Cloud Execution (Web):**
- Isolated Anthropic-managed VMs per session
- GitHub proxy for secure authentication
- Network proxy with allowlisting
- Auto-cleanup after session

**Permission System:**
- Tiered permissions (read-only, bash, file modification)
- Granular control with wildcards (`Bash(npm run test:*)`)
- Deny rules > Ask rules > Allow rules
- Session-based "don't ask again"

**Enterprise Features:**
- Managed settings (enforced via admin console)
- Cannot be overridden locally
- Centralized policy enforcement
- Cloud-based context storage

### Docker Sandboxes (Industry Standard)

**Purpose-Built for AI Agents:**
- Containers inside Docker Desktop VM
- Mirror local workspace with strict boundaries
- Plans to use dedicated microVMs for deeper isolation
- Container-based isolation for dynamic AI workflows

**Security Model:**
- Defense-in-depth with multiple layers
- Granular security controls
- Network access restrictions
- File system isolation

### OpenHands Approach

**Docker-Based Sandboxing:**
- Separate runtime container from application
- SSH access to container (mimics remote development)
- Per-session isolation with automatic teardown
- Workspace mounting (only project files exposed)

**Security Considerations:**
- Docker socket access (`/var/run/docker.sock`) gives full daemon control
- Risk: Access to all Docker resources on host
- Mitigation: Don't run on production systems with important containers
- Human-in-the-loop for change approval

### Aider Approach

**No Built-In Sandboxing:**
- Lightweight terminal tool
- Relies on external Docker/dev containers
- User responsible for sandboxing setup
- Focuses on code editing workflow

---

## 🏗️ Mimir Architecture Design

### 1. Sandboxed Agent Execution

#### Execution Modes

```
┌─────────────────────────────────────────────────────┐
│              Mimir Execution Modes                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. Local (Unsandboxed) - Development only          │
│     ├─ Direct filesystem access                     │
│     ├─ No isolation                                 │
│     └─ INSECURE - Only for trusted environments     │
│                                                     │
│  2. Local (Sandboxed) - Recommended                 │
│     ├─ Docker container per agent                   │
│     ├─ Workspace mounting (project files only)      │
│     ├─ Network restrictions (optional)              │
│     └─ Resource limits (CPU/memory)                 │
│                                                     │
│  3. Cloud (Mimir Teams) - Enterprise                │
│     ├─ Isolated cloud VMs per session               │
│     ├─ Managed by Mimir Teams backend               │
│     ├─ Network proxy with allowlisting              │
│     └─ Centralized audit logs                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Docker Sandbox Architecture

```typescript
/**
 * Docker sandbox configuration
 */
interface DockerSandboxConfig {
  /**
   * Base image for sandbox
   * Default: ubuntu:22.04 with common dev tools
   */
  baseImage: string;

  /**
   * Workspace mount (project directory)
   * Read/write access to project files only
   */
  workspaceMount: {
    hostPath: string;      // e.g., /home/user/project
    containerPath: string; // e.g., /workspace
    readOnly: false;
  };

  /**
   * Additional read-only mounts (for dependencies)
   */
  additionalMounts?: Array<{
    hostPath: string;
    containerPath: string;
    readOnly: boolean;
  }>;

  /**
   * Network access mode
   */
  network: 'disabled' | 'limited' | 'full';

  /**
   * Allowed domains (if network = 'limited')
   */
  allowedDomains?: string[];

  /**
   * Resource limits
   */
  resources: {
    cpuLimit: string;    // e.g., '2.0' (2 cores)
    memoryLimit: string; // e.g., '4g'
    diskLimit?: string;  // e.g., '10g'
  };

  /**
   * Auto-cleanup after session
   */
  autoCleanup: boolean;

  /**
   * Environment variables
   */
  env?: Record<string, string>;
}
```

**Example Configuration:**

```yaml
# .mimir/config.yml
sandbox:
  enabled: true
  mode: docker  # 'docker' | 'os-sandbox' | 'cloud'

  docker:
    baseImage: mimir/sandbox:latest
    workspaceMount:
      hostPath: ${PROJECT_DIR}
      containerPath: /workspace
      readOnly: false

    network: limited
    allowedDomains:
      - github.com
      - npmjs.com
      - pypi.org
      - docker.io

    resources:
      cpuLimit: '2.0'
      memoryLimit: '4g'

    autoCleanup: true
```

#### Agent Execution Flow

```
┌─────────────────────────────────────────────────────┐
│          Agent Execution in Sandbox                 │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  1. Create Sandbox Container   │
        │     - Pull base image          │
        │     - Mount workspace          │
        │     - Apply resource limits    │
        │     - Set network mode         │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  2. Agent Initialization       │
        │     - Install dependencies     │
        │     - Set up environment       │
        │     - Configure tools          │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  3. Execute Agent Tasks        │
        │     ┌──────────────────────┐   │
        │     │ LLM determines action│   │
        │     └──────────────────────┘   │
        │              │                  │
        │              ▼                  │
        │     ┌──────────────────────┐   │
        │     │ Permission check     │   │
        │     │ (allowlist/deny)     │   │
        │     └──────────────────────┘   │
        │              │                  │
        │              ▼                  │
        │     ┌──────────────────────┐   │
        │     │ Execute in sandbox   │   │
        │     │ (file ops, bash)     │   │
        │     └──────────────────────┘   │
        │              │                  │
        │              ▼                  │
        │     ┌──────────────────────┐   │
        │     │ Return results       │   │
        │     └──────────────────────┘   │
        └────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  4. Cleanup Sandbox            │
        │     - Stop container           │
        │     - Remove container         │
        │     - Clean up volumes         │
        └────────────────────────────────┘
```

#### Security Model

**Filesystem Isolation:**
```
Container View:
  /workspace/          → Mounted from host project (READ/WRITE)
  /usr/bin/            → Base image binaries (READ-ONLY)
  /tmp/                → Ephemeral storage (READ/WRITE, auto-clean)

Host filesystem:       → NOT accessible
  /home/user/.ssh/     → DENIED
  /etc/                → DENIED
  ../                  → DENIED (no parent directory escape)
```

**Network Isolation:**
```typescript
/**
 * Network modes
 */
enum NetworkMode {
  Disabled = 'disabled',    // No network access
  Limited = 'limited',      // Allowlist-based
  Full = 'full',            // All access (use with caution)
}

/**
 * Default allowlist for 'limited' mode
 */
const DEFAULT_ALLOWED_DOMAINS = [
  // Version control
  'github.com',
  'gitlab.com',
  'bitbucket.org',

  // Package managers
  'npmjs.com',
  'pypi.org',
  'crates.io',
  'rubygems.org',

  // Container registries
  'docker.io',
  'gcr.io',
  'ghcr.io',

  // Cloud platforms
  'amazonaws.com',
  'googleapis.com',
  'azure.com',
];
```

**Resource Limits:**
```yaml
# Prevent resource exhaustion
resources:
  cpuLimit: '2.0'        # Max 2 CPU cores
  memoryLimit: '4g'      # Max 4GB RAM
  diskLimit: '10g'       # Max 10GB disk (optional)
  processLimit: 100      # Max 100 processes
  fileHandleLimit: 1024  # Max 1024 open files
```

#### Permission System Integration

**Agent-Specific Permissions:**
```yaml
# .mimir/config.yml
permissions:
  allowlist:
    # Allow specific bash commands
    - type: bash
      pattern: 'npm run test:*'
      scope: sandbox  # Only in sandbox

    # Allow file modifications in project
    - type: file_write
      pattern: '/workspace/**/*.ts'
      scope: sandbox

    # Allow read access to dependencies
    - type: file_read
      pattern: '/workspace/node_modules/**'
      scope: sandbox

  denylist:
    # Deny dangerous commands
    - type: bash
      pattern: 'curl:*'
      scope: all

    # Deny modifications to critical files
    - type: file_write
      pattern: '/workspace/.git/**'
      scope: all
```

**Permission Prompt:**
```
┌─────────────────────────────────────────────────────┐
│          Permission Request                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Agent: tester                                      │
│  Action: Execute bash command                       │
│  Command: npm run test                              │
│  Location: Sandbox container                        │
│  Risk Level: Low                                    │
│                                                     │
│  Options:                                           │
│    [y] Allow once                                   │
│    [a] Always allow (this session)                  │
│    [n] Deny                                         │
│    [v] View details                                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### 2. Cloud-Based Context Management (Mimir Teams)

#### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│         Mimir Teams Cloud Architecture              │
└─────────────────────────────────────────────────────┘

┌─────────────┐                  ┌─────────────────────┐
│  Local CLI  │ ◄──── API ────► │  Mimir Teams API    │
│             │                  │                     │
│  - Agents   │                  │  - Context Storage  │
│  - Prompts  │                  │  - Policy Engine    │
│  - Tools    │                  │  - Audit Logs       │
└─────────────┘                  │  - LLM Proxy        │
                                 │  - Cloud Sandboxes  │
                                 └─────────────────────┘
                                          │
                                          ▼
                                 ┌─────────────────────┐
                                 │  Cloud VM Pool      │
                                 │                     │
                                 │  ┌───┐ ┌───┐ ┌───┐ │
                                 │  │VM1│ │VM2│ │VM3│ │
                                 │  └───┘ └───┘ └───┘ │
                                 │                     │
                                 │  Per-session        │
                                 │  isolation          │
                                 └─────────────────────┘
```

#### Context Storage Backends

```typescript
/**
 * Storage backend interface
 */
interface IContextStorageBackend {
  /**
   * Save conversation context
   */
  saveContext(
    workflowId: string,
    context: WorkflowContext,
    messages: any[]
  ): Promise<void>;

  /**
   * Load conversation context
   */
  loadContext(workflowId: string): Promise<{
    context: WorkflowContext;
    messages: any[];
  } | null>;

  /**
   * Save compacted summary
   */
  saveSummary(
    workflowId: string,
    summary: string,
    scope: ContextScope
  ): Promise<void>;

  /**
   * Get available context capacity
   */
  getCapacity(workflowId: string): Promise<{
    used: number;
    max: number;
    utilization: number;
  }>;

  /**
   * Delete context (cleanup)
   */
  deleteContext(workflowId: string): Promise<void>;
}

/**
 * Local storage backend (SQLite)
 */
class LocalContextStorage implements IContextStorageBackend {
  // Stores context in .mimir/mimir.db
  // Same as current implementation
}

/**
 * Cloud storage backend (Mimir Teams API)
 */
class CloudContextStorage implements IContextStorageBackend {
  constructor(
    private apiClient: TeamsAPIClient,
    private orgId: string
  ) {}

  async saveContext(
    workflowId: string,
    context: WorkflowContext,
    messages: any[]
  ): Promise<void> {
    // POST /api/v1/orgs/:orgId/context/:workflowId
    await this.apiClient.post(`/context/${workflowId}`, {
      context,
      messages,
      timestamp: new Date(),
    });
  }

  async loadContext(workflowId: string): Promise<{
    context: WorkflowContext;
    messages: any[];
  } | null> {
    // GET /api/v1/orgs/:orgId/context/:workflowId
    const response = await this.apiClient.get(`/context/${workflowId}`);
    return response.data;
  }

  // ... other methods
}

/**
 * Hybrid storage backend (local-first with cloud sync)
 */
class HybridContextStorage implements IContextStorageBackend {
  constructor(
    private local: LocalContextStorage,
    private cloud: CloudContextStorage,
    private syncInterval: number = 30_000 // 30 seconds
  ) {
    this.startBackgroundSync();
  }

  async saveContext(
    workflowId: string,
    context: WorkflowContext,
    messages: any[]
  ): Promise<void> {
    // Write locally immediately (fast)
    await this.local.saveContext(workflowId, context, messages);

    // Queue for background sync to cloud
    this.queueSync(workflowId);
  }

  async loadContext(workflowId: string): Promise<{
    context: WorkflowContext;
    messages: any[];
  } | null> {
    // Try local first (fast)
    const localData = await this.local.loadContext(workflowId);
    if (localData) return localData;

    // Fallback to cloud
    const cloudData = await this.cloud.loadContext(workflowId);
    if (cloudData) {
      // Cache locally
      await this.local.saveContext(workflowId, cloudData.context, cloudData.messages);
    }
    return cloudData;
  }

  private startBackgroundSync(): void {
    setInterval(() => {
      this.syncPendingContexts();
    }, this.syncInterval);
  }

  // ... sync queue implementation
}
```

#### Context Compaction in Cloud

**Server-Side Compaction:**
```
┌─────────────────────────────────────────────────────┐
│      Cloud-Based Context Management Flow            │
└─────────────────────────────────────────────────────┘

Local Agent                     Mimir Teams API
    │                                  │
    │  1. Send message                 │
    ├─────────────────────────────────►│
    │                                  │
    │                                  │  Check context
    │                                  │  utilization
    │                                  │      │
    │                                  │      ▼
    │                                  │  ┌──────────┐
    │                                  │  │ 95% full?│
    │                                  │  └──────────┘
    │                                  │      │
    │                                  │      ▼ YES
    │                                  │  ┌──────────┐
    │                                  │  │ Compact  │
    │                                  │  │ context  │
    │                                  │  └──────────┘
    │                                  │      │
    │  2. Return compacted context     │      ▼
    │◄─────────────────────────────────┤
    │                                  │
    │  3. Continue with new capacity   │
    ├─────────────────────────────────►│
    │                                  │
```

**Cloud Context API:**
```typescript
/**
 * Teams API context endpoints
 */
interface TeamsContextAPI {
  /**
   * GET /api/v1/orgs/:orgId/context/:workflowId
   * Load context with auto-compaction
   */
  getContext(workflowId: string): Promise<{
    context: WorkflowContext;
    messages: any[];
    stats: {
      utilization: number;
      compacted: boolean;
      tokensSaved?: number;
    };
  }>;

  /**
   * POST /api/v1/orgs/:orgId/context/:workflowId
   * Save context (auto-compact if needed)
   */
  saveContext(workflowId: string, data: {
    context: WorkflowContext;
    messages: any[];
  }): Promise<{
    saved: boolean;
    compacted: boolean;
    stats: ContextStats;
  }>;

  /**
   * POST /api/v1/orgs/:orgId/context/:workflowId/compact
   * Force compaction
   */
  compactContext(workflowId: string, options?: {
    focus?: string;
    strategy?: 'relevance' | 'recency' | 'hybrid';
  }): Promise<{
    summary: string;
    tokensSaved: number;
    newUtilization: number;
  }>;

  /**
   * GET /api/v1/orgs/:orgId/context/:workflowId/stats
   * Get context statistics
   */
  getStats(workflowId: string): Promise<ContextStats>;
}
```

#### Managed Settings (Enterprise Policy)

**Enforced Configuration:**
```yaml
# Managed by Mimir Teams Admin Console
# Cannot be overridden by users locally

# Sandbox requirements (ENFORCED)
sandbox:
  required: true
  mode: cloud  # Force cloud sandboxes

  docker:
    allowedBaseImages:
      - mimir/sandbox:ubuntu-22.04
      - mimir/sandbox:node-20
    network: limited
    allowedDomains:
      - github.com
      - npmjs.com
      # ... org-specific domains

# Context management (ENFORCED)
context:
  storage: cloud  # Force cloud storage
  thresholds:
    approaching: 0.75
    warning: 0.90
    critical: 0.95
  autoCompact: true
  backgroundCompaction: true

# Agent restrictions (ENFORCED)
agents:
  allowedRoles:
    - finder
    - thinker
    - librarian
    - reviewer
    - tester
    # security role REQUIRED for code_modification

  enforcedAgents:
    - trigger: code_modification
      role: security
      when: after
      requireApproval: false  # Auto-run for compliance

# Permission policies (ENFORCED)
permissions:
  allowlist:
    - type: bash
      pattern: 'npm run test:*'
    - type: file_write
      pattern: '/workspace/src/**/*.ts'

  denylist:
    - type: bash
      pattern: 'curl:*'
    - type: file_write
      pattern: '/workspace/.env'
```

**Settings Precedence:**
```
1. Managed Settings (Teams Admin Console)  ← ENFORCED (highest)
   ↓ Cannot override
2. File-Based Managed Settings
   ↓ Can override
3. Local Project Settings (.mimir/config.yml)
   ↓ Can override
4. User Settings (~/.mimir/config.yml)
   ↓ Can override
5. Default Settings (hardcoded fallbacks)    ← lowest
```

---

## 🔧 Implementation Plan

### Phase 1: Docker Sandbox Foundation

**Components:**
1. `DockerSandboxManager` - Container lifecycle management
2. `SandboxExecutor` - Execute commands in sandbox
3. `WorkspaceMounter` - Mount project files securely
4. `NetworkProxyManager` - Enforce network restrictions

**Tasks:**
- [ ] Implement DockerSandboxManager with dockerode
- [ ] Create base sandbox images (Ubuntu, Node, Python)
- [ ] Implement workspace mounting with read/write controls
- [ ] Add resource limit enforcement
- [ ] Integrate with permission system
- [ ] Add auto-cleanup on session end

**Tests:**
- [ ] Container creation/destruction
- [ ] Filesystem isolation
- [ ] Network restrictions
- [ ] Resource limit enforcement
- [ ] Permission integration

### Phase 2: Cloud Context Storage

**Components:**
1. `IContextStorageBackend` - Storage abstraction interface
2. `CloudContextStorage` - Teams API integration
3. `HybridContextStorage` - Local-first with cloud sync
4. `ContextSyncManager` - Background sync queue

**Tasks:**
- [ ] Define IContextStorageBackend interface
- [ ] Implement CloudContextStorage
- [ ] Implement HybridContextStorage with sync queue
- [ ] Add Teams API context endpoints
- [ ] Server-side compaction logic
- [ ] Context encryption for cloud storage

**Tests:**
- [ ] Local storage backend
- [ ] Cloud storage backend
- [ ] Hybrid sync behavior
- [ ] Background sync queue
- [ ] Encryption/decryption

### Phase 3: Enhanced Context Manager

**Components:**
1. Enhanced `ContextManager` with threshold monitoring
2. `ContextMonitor` - Continuous threshold detection
3. `BackgroundCompactor` - Async compaction queue
4. `AgentBlocker` - Block agents at critical threshold

**Tasks:**
- [ ] Add threshold levels (approaching, warning, critical)
- [ ] Implement continuous monitoring
- [ ] Add background compaction queue
- [ ] Implement agent blocking at critical threshold
- [ ] Integrate with WorkflowOrchestrator
- [ ] Add metrics and alerts

**Tests:**
- [ ] Threshold detection
- [ ] Background compaction
- [ ] Agent blocking behavior
- [ ] Multi-scale management
- [ ] Cloud storage integration

### Phase 4: Enterprise Integration

**Components:**
1. `ManagedSettingsLoader` - Load enforced config from Teams API
2. `PolicyEnforcer` - Validate local config against managed settings
3. `CloudSandboxManager` - Provision cloud VMs via API
4. `AuditLogger` - Log all sandbox operations

**Tasks:**
- [ ] Implement managed settings loader
- [ ] Add policy enforcement layer
- [ ] Integrate cloud sandbox provisioning
- [ ] Add comprehensive audit logging
- [ ] Admin dashboard for Teams console
- [ ] Metrics and monitoring

**Tests:**
- [ ] Managed settings enforcement
- [ ] Policy validation
- [ ] Cloud sandbox lifecycle
- [ ] Audit log integrity

---

## 🔐 Security Best Practices

### 1. Defense-in-Depth

**Multiple Layers:**
1. **Permission System** - First gate (allowlist/deny)
2. **Sandbox Isolation** - Second gate (container boundaries)
3. **Network Restrictions** - Third gate (allowlist domains)
4. **Resource Limits** - Fourth gate (prevent exhaustion)
5. **Audit Logs** - Forensics and compliance

### 2. Principle of Least Privilege

**Agent Permissions:**
- Grant minimum necessary access
- Read-only by default, write on demand
- Network disabled by default
- Escalate only with explicit approval

**Workspace Access:**
```yaml
# Good: Minimal access
workspace:
  readOnly: false
  paths:
    - /workspace/src/**
    - /workspace/tests/**

# Bad: Overly permissive
workspace:
  readOnly: false
  paths:
    - /workspace/**  # Too broad
```

### 3. Secrets Management

**Never expose secrets to agents:**
```yaml
# Bad: Secrets in environment
env:
  DATABASE_PASSWORD: 'my-password'  # ❌ INSECURE

# Good: Secret references
env:
  DATABASE_PASSWORD: '${SECRET:db_password}'  # ✅ Fetched securely
```

**Secret Proxy:**
```typescript
/**
 * Secret proxy for cloud sandboxes
 */
class SecretProxy {
  /**
   * Resolve secret reference
   * Agent sees: DATABASE_PASSWORD=***REDACTED***
   * Actual value injected by proxy at runtime
   */
  async resolveSecret(reference: string): Promise<string> {
    // Fetch from Teams API secret store
    const secret = await this.teamsAPI.getSecret(reference);
    return secret.value;
  }
}
```

### 4. Network Security

**Default Deny:**
```yaml
# Default: No network access
network: disabled

# If needed: Allowlist specific domains
network: limited
allowedDomains:
  - github.com      # VCS
  - npmjs.com       # Package manager
  - api.myorg.com   # Internal API
```

**Proxy All Traffic:**
```
Agent Request → Network Proxy → Allowlist Check → External Service
                      ↓
                  (Log & Audit)
```

### 5. Monitoring & Alerts

**Key Metrics:**
- Sandbox creation/destruction rate
- Permission denials
- Network access attempts
- Resource limit violations
- Context utilization spikes

**Alerts:**
```yaml
alerts:
  - name: excessive_sandbox_creation
    condition: rate > 10 per minute
    action: notify_admin

  - name: permission_denial_spike
    condition: denials > 5 in 1 minute
    action: block_agent

  - name: context_critical_threshold
    condition: utilization >= 0.95
    action: force_compaction
```

---

## 📚 API Design

### DockerSandboxManager

```typescript
/**
 * Manages Docker sandbox lifecycle
 */
export class DockerSandboxManager {
  constructor(
    private docker: Docker,
    private config: DockerSandboxConfig
  ) {}

  /**
   * Create sandbox container
   */
  async createSandbox(
    workflowId: string,
    agentRole: AgentRole
  ): Promise<SandboxContainer> {
    const container = await this.docker.createContainer({
      Image: this.config.baseImage,
      HostConfig: {
        Binds: [
          `${this.config.workspaceMount.hostPath}:${this.config.workspaceMount.containerPath}`,
        ],
        NetworkMode: this.getNetworkMode(),
        Memory: this.parseMemoryLimit(this.config.resources.memoryLimit),
        NanoCpus: this.parseCpuLimit(this.config.resources.cpuLimit),
      },
      Env: this.buildEnvVars(),
      Labels: {
        'mimir.workflow': workflowId,
        'mimir.agent.role': agentRole,
      },
    });

    await container.start();

    return {
      id: container.id,
      workflowId,
      agentRole,
      created: new Date(),
    };
  }

  /**
   * Execute command in sandbox
   */
  async execute(
    containerId: string,
    command: string,
    options?: ExecuteOptions
  ): Promise<ExecuteResult> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});

    // Collect output
    const output = await this.collectOutput(stream);

    // Get exit code
    const inspect = await exec.inspect();

    return {
      exitCode: inspect.ExitCode,
      stdout: output.stdout,
      stderr: output.stderr,
      duration: Date.now() - options?.startTime!,
    };
  }

  /**
   * Cleanup sandbox
   */
  async cleanup(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    await container.stop();
    await container.remove();
  }

  /**
   * Cleanup all sandboxes for workflow
   */
  async cleanupWorkflow(workflowId: string): Promise<void> {
    const containers = await this.docker.listContainers({
      filters: {
        label: [`mimir.workflow=${workflowId}`],
      },
    });

    await Promise.all(
      containers.map(c => this.cleanup(c.Id))
    );
  }
}
```

### CloudContextStorage

```typescript
/**
 * Cloud-based context storage via Teams API
 */
export class CloudContextStorage implements IContextStorageBackend {
  constructor(
    private apiClient: TeamsAPIClient,
    private orgId: string
  ) {}

  async saveContext(
    workflowId: string,
    context: WorkflowContext,
    messages: any[]
  ): Promise<void> {
    const response = await this.apiClient.post(
      `/orgs/${this.orgId}/context/${workflowId}`,
      {
        context,
        messages,
        timestamp: new Date(),
      }
    );

    if (response.data.compacted) {
      // Server performed auto-compaction
      console.log(`Context auto-compacted, saved ${response.data.tokensSaved} tokens`);
    }
  }

  async loadContext(workflowId: string): Promise<{
    context: WorkflowContext;
    messages: any[];
  } | null> {
    try {
      const response = await this.apiClient.get(
        `/orgs/${this.orgId}/context/${workflowId}`
      );

      return {
        context: response.data.context,
        messages: response.data.messages,
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getCapacity(workflowId: string): Promise<{
    used: number;
    max: number;
    utilization: number;
  }> {
    const response = await this.apiClient.get(
      `/orgs/${this.orgId}/context/${workflowId}/stats`
    );

    return {
      used: response.data.totalTokens,
      max: response.data.maxTokens,
      utilization: response.data.utilization,
    };
  }

  async saveSummary(
    workflowId: string,
    summary: string,
    scope: ContextScope
  ): Promise<void> {
    await this.apiClient.post(
      `/orgs/${this.orgId}/context/${workflowId}/summary`,
      { summary, scope, timestamp: new Date() }
    );
  }

  async deleteContext(workflowId: string): Promise<void> {
    await this.apiClient.delete(
      `/orgs/${this.orgId}/context/${workflowId}`
    );
  }
}
```

---

## 🎓 Decision Rationale

### Why Docker Over OS-Level Sandboxing?

**Pros of Docker:**
- Cross-platform (Windows, macOS, Linux)
- Mature ecosystem with tooling
- Easy to configure (Dockerfile, docker-compose)
- Resource limits built-in
- Network isolation straightforward
- Teams already familiar with Docker

**Cons of Docker:**
- Requires Docker daemon running
- Higher resource overhead than OS-level
- Docker socket access risk

**Decision:** Use Docker for **sandboxed mode** + support **unsandboxed mode** for development.
- Production/Teams: Docker required
- Development: Optional (faster iteration)

### Why Cloud Context for Teams?

**Pros:**
- Centralized audit logs
- Cross-device access
- Backup and disaster recovery
- Compliance (data residency)
- Easier to enforce policies
- No local storage limits

**Cons:**
- Requires internet connection
- Latency for context operations
- Privacy concerns for code snippets

**Decision:** Hybrid approach
- Teams: Cloud-based (required)
- Individual: Local SQLite (default) or opt-in cloud sync

### Why Hybrid Storage?

**Best of Both Worlds:**
- Local-first: Fast reads/writes
- Background sync: Cloud backup
- Offline capability: Work without internet
- Eventual consistency: Sync when reconnected

**Use Cases:**
- Developer laptop (local-first)
- Team collaboration (cloud sync)
- Compliance requirements (cloud audit)

---

## 📖 References

**Industry Research:**
- [Claude Code Security Documentation](https://code.claude.com/docs/en/security.md)
- [Claude Code Sandboxing Guide](https://code.claude.com/docs/en/sandboxing.md)
- [Docker Sandboxes for AI Agents](https://www.docker.com/blog/docker-sandboxes-a-new-approach-for-coding-agent-safety/)
- [Docker Sandboxes Documentation](https://docs.docker.com/ai/sandboxes)
- [OpenHands Docker Sandbox Guide](https://docs.openhands.dev/sdk/guides/agent-server/docker-sandbox)
- [Secure AI Agents at Runtime with Docker](https://www.docker.com/blog/secure-ai-agents-runtime-security/)

**Best Practices:**
- [How to Sandbox LLMs & AI Shell Tools](https://www.codeant.ai/blogs/agentic-rag-shell-sandboxing)
- [Building a Sandboxed Environment for AI Code Execution](https://anukriti-ranjan.medium.com/building-a-sandboxed-environment-for-ai-generated-code-execution-e1351301268a)
- [Why Docker Sandboxes Alone Don't Make AI Agents Safe](https://blog.arcade.dev/docker-sandboxes-arent-enough-for-agent-safety)

---

**Generated**: 2025-12-28
**Status**: Architecture Design Complete
**Next**: Implementation Phase 1 (Docker Sandbox Foundation)
