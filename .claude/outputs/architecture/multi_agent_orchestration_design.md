# Multi-Agent Orchestration Architecture
**Date**: 2025-12-28
**Status**: Design Complete - Ready for Implementation

## Research Summary

### Industry Patterns

**Claude Code** ([Multi-Agent Orchestration](https://dev.to/bredmond1019/multi-agent-orchestration-running-10-claude-instances-in-parallel-part-3-29da), [Subagents Guide](https://www.cursor-ide.com/blog/claude-subagents)):
- Orchestrator-worker architecture (Opus/Sonnet 4 orchestrator, Sonnet/Haiku workers)
- 90.2% better performance with multi-agent vs single-agent approaches
- Lead agent responsibilities: task decomposition, subagent spawning, result aggregation, quality control
- Community tools use @mentions for agent coordination
- Programmatic tool calling for better control flow

**MetaGPT** ([IBM MetaGPT](https://www.ibm.com/think/topics/metagpt)):
- Role-based agents mimicking software company structure (PM, architect, project manager, engineer, QA)
- Sequential/assembly-line workflows for complex tasks
- Each agent has specific profile, goal, constraints
- Standardized operating procedures (SOPs)

**CrewAI** ([Framework Comparison](https://www.concision.ai/blog/comparing-multi-agent-ai-frameworks-crewai-langgraph-autogpt-autogen)):
- Role-playing autonomous AI agents that collaborate effectively
- "Process" and "Crew" for orchestration
- Agents think independently, share tasks, coordinate toward common objective

**AutoGPT**:
- Autonomous goal achievement via task decomposition
- Adaptive approach based on user goals
- Workflow using "blocks" for actions

**Security & Enforcement** ([Multi-Agent Security](https://google.github.io/adk-docs/agents/multi-agents/), [AWS Security Framework](https://aws.amazon.com/blogs/security/the-agentic-ai-security-scoping-matrix-a-framework-for-securing-autonomous-ai-systems/)):
- LoopAgent pattern for iterative workflows
- SecurityPlugin with human-in-the-loop for critical actions
- Role-based access control, validated inter-agent communication
- Continuous behavioral validation and monitoring
- Escalation procedures for deviations

---

## Mimir's Multi-Agent Architecture

### Core Design Principles

1. **Dynamic Workflows**: Agents can spawn other agents based on need
2. **Enforced Quality Gates**: Mandatory security/reviewer/tester agents (policy-driven)
3. **Loop Support**: Iterative refinement loops (thinker → tester → reviewer → thinker)
4. **Flexible Execution**: Parallel, sequential, and DAG-based workflows
5. **Context Sharing**: Results flow between agents in dependency graph
6. **Monitoring & Safety**: Behavioral validation, loop detection, resource limits

### Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    WorkflowOrchestrator                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Task         │  │ Workflow     │  │ Quality      │      │
│  │ Decomposer   │─▶│ Planner      │─▶│ Gate         │      │
│  └──────────────┘  └──────────────┘  │ Enforcer     │      │
│                                       └──────────────┘      │
│  ┌──────────────────────────────────────────────────┐      │
│  │          WorkflowEngine                          │      │
│  │  • Dynamic spawning                              │      │
│  │  • Loop detection & management                   │      │
│  │  • Parallel + sequential + DAG execution         │      │
│  │  • Context passing between agents                │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
  │ Agent       │      │ Role        │      │ Enforcement │
  │ Factory     │      │ Registry    │      │ Rules       │
  └─────────────┘      └─────────────┘      └─────────────┘
         │
         ▼
  ┌─────────────────────────────────────────────────┐
  │            Specialized Agents                    │
  │  finder | thinker | reviewer | security         │
  │  tester | refactoring | librarian | rush        │
  └─────────────────────────────────────────────────┘
```

### Workflow Execution Model

#### 1. Static Workflow (Pre-Planned DAG)
```
User Request → TaskDecomposer → Workflow Plan
                                     ↓
                            Quality Gate Enforcer
                            (adds mandatory agents)
                                     ↓
                            WorkflowEngine executes DAG
```

**Example**: "Add login feature"
```
finder (find auth files)
   ↓
thinker (implement login)
   ↓
tester (generate tests) ←──┐
   ↓                        │
reviewer (code review) ─────┤ (loop if issues found)
   ↓                        │
security (security audit) ──┘
   ↓
DONE
```

#### 2. Dynamic Workflow (Agent-Requested Spawning)
```
Agent executing → Requests another agent → WorkflowOrchestrator spawns
                                                    ↓
                                        Enforces quality gates
                                                    ↓
                                        Adds to active workflow
```

**Example**: "Fix authentication bug"
```
finder (search for bug)
   ↓
   └─[requests: thinker] → thinker (analyze & fix)
                              ↓
                              └─[requests: tester] → tester (validate fix)
                                                        ↓
                                                        └─[enforced: security]
                                                              ↓
                                                           DONE
```

#### 3. Iterative Loop Workflow
```
Agent A → Agent B → Agent C ─┐
   ↑                          │
   └──────────────────────────┘
   (loop until quality threshold met or max iterations)
```

**Example**: "Refactor complex module"
```
refactoring (refactor code)
   ↓
tester (run tests) ─────────┐
   ↓                         │
reviewer (review changes) ───┤
   ↓                         │
   ├─[tests fail] ───────────┘ (loop back)
   │
   └─[tests pass + review approved]
         ↓
      DONE
```

### Agent Roles & Capabilities

| Role | Model | Tools | Purpose | Max Iterations |
|------|-------|-------|---------|----------------|
| **finder** | Haiku/Qwen | read-only | Quick file searches | 5 |
| **thinker** | o3/Opus/Sonnet 4.5 | all | Deep reasoning, complex problems | 20 |
| **librarian** | Sonnet 4.5 | read-only + web | API/docs research | 10 |
| **refactoring** | Sonnet 4.5 | read + write | Code refactoring | 15 |
| **reviewer** | Sonnet 4.5/o3 | read + git | Code review, quality check | 10 |
| **tester** | Sonnet 4.5 | read + write + bash | Test generation & execution | 15 |
| **security** | o3/Sonnet 4.5 | read + git | Security analysis | 10 |
| **rush** | Haiku | all | Quick targeted loops | 3-5 |
| **general** | configurable | all | General purpose | 20 |

### Enforcement Rules

**Teams/Enterprise** can enforce agents via config:

```yaml
agentOrchestration:
  enforcedAgents:
    # Always run security agent after code changes
    - trigger: code_modification
      role: security
      when: after

    # Always run tester before review
    - trigger: code_modification
      role: tester
      when: before_review

    # Always run reviewer
    - trigger: code_modification
      role: reviewer
      when: always

  loopPolicies:
    maxLoopIterations: 5
    maxNestedLoops: 2
    requireApprovalForLoops: true
```

### Loop Detection & Management

**Loop Types**:
1. **Intended Loops**: Thinker → Tester → Reviewer → (back to Thinker if issues)
2. **Accidental Loops**: Agent A spawns Agent B spawns Agent A (infinite recursion)

**Detection Strategy**:
```typescript
interface LoopDetection {
  // Track agent call stack
  callStack: AgentCall[];

  // Detect cycles in dependency graph
  detectCycle(): boolean;

  // Allow intended loops up to maxIterations
  allowedLoops: LoopPattern[];

  // Emergency circuit breaker
  maxTotalAgents: number;
  maxNestingDepth: number;
}
```

**Loop Pattern Example**:
```typescript
{
  pattern: ['thinker', 'tester', 'reviewer'],
  maxIterations: 5,
  breakCondition: (results) => {
    // Break if tests pass AND review approved
    return results.tester.success && results.reviewer.approved;
  }
}
```

### Context Passing Between Agents

Agents share context via **WorkflowContext**:

```typescript
interface WorkflowContext {
  // Shared state
  sharedState: {
    filesModified: string[];
    testsRun: TestResult[];
    securityIssues: SecurityIssue[];
    reviewComments: ReviewComment[];
  };

  // Agent results (passed to downstream agents)
  agentResults: Map<AgentId, AgentResult>;

  // Quality gates (enforced checks)
  qualityGates: {
    testsPass: boolean;
    securityApproved: boolean;
    reviewApproved: boolean;
  };
}
```

**Example Flow**:
```
finder finds auth files → context.sharedState.filesModified = ['auth.ts']
                              ↓
thinker modifies auth.ts → context.sharedState.filesModified += ['auth.ts']
                              ↓
tester runs tests → context.qualityGates.testsPass = true
                              ↓
security audits → context.qualityGates.securityApproved = false
                              ↓
    (loop back to thinker because security gate failed)
```

---

## Implementation Plan

### Phase 1: Foundation (Current)
- ✅ AgentOrchestrator with DAG execution
- ✅ Streaming events
- ✅ Resource quotas
- ✅ Context management

### Phase 2: Roles & Workflows (Next)
1. **RoleRegistry** with standard roles
2. **TaskDecomposer** with LLM-powered workflow planning
3. **AgentFactory** for role-based agent creation
4. **EnforcementEngine** for mandatory agents

### Phase 3: Dynamic Orchestration (Future)
1. **WorkflowEngine** with dynamic spawning
2. **LoopDetector** for cycle detection
3. **ContextManager** for inter-agent communication
4. **QualityGateEnforcer** for validation

### Phase 4: Advanced Features (Future)
1. Agent @mentions for coordination
2. Parallel agent execution with progress UI
3. Human-in-the-loop approval for loops
4. Behavioral monitoring & anomaly detection

---

## API Design

### WorkflowOrchestrator

```typescript
class WorkflowOrchestrator {
  // Execute static workflow (pre-planned DAG)
  async executeWorkflow(plan: WorkflowPlan): Promise<WorkflowResult>;

  // Execute dynamic workflow (agents can spawn others)
  async executeDynamic(task: string, options: DynamicOptions): Promise<WorkflowResult>;

  // Spawn agent from another agent
  async spawnAgent(request: SpawnRequest, context: WorkflowContext): Promise<Agent>;

  // Enforce quality gates
  async enforceQualityGates(workflow: Workflow): void;

  // Detect and manage loops
  detectLoop(workflow: Workflow): LoopInfo | null;
  allowLoop(loopInfo: LoopInfo): boolean;
}
```

### TaskDecomposer

```typescript
class TaskDecomposer {
  // Analyze task and suggest workflow
  async analyze(task: string, options: DecompositionOptions): Promise<WorkflowPlan>;

  // Generate workflow from task description
  async planWorkflow(task: string): Promise<WorkflowPlan>;

  // Suggest agent roles for subtasks
  suggestRoles(subtasks: SubTask[]): RoleSuggestion[];
}
```

### RoleRegistry

```typescript
class RoleRegistry {
  // Register role configuration
  register(role: AgentRole, config: RoleConfig): void;

  // Get role configuration
  get(role: AgentRole): RoleConfig;

  // List all roles
  list(): RoleConfig[];

  // Check if role is enforced
  isEnforced(role: AgentRole, trigger: Trigger): boolean;
}
```

---

## Testing Strategy

1. **Unit Tests**:
   - RoleRegistry: register, get, list, enforcement rules
   - TaskDecomposer: mock LLM, verify workflow generation
   - LoopDetector: cycle detection, allowed loops
   - AgentFactory: role-based creation, tool restrictions

2. **Integration Tests**:
   - Static workflow execution (DAG)
   - Dynamic agent spawning
   - Loop management (intended + accidental)
   - Quality gate enforcement
   - Context passing between agents

3. **E2E Tests**:
   - Complete workflow: finder → thinker → tester → reviewer → security
   - Iterative loop: refactoring with feedback
   - Enforced agents: security audit required
   - Parallel execution: multiple agents concurrently

---

## Success Criteria

✅ 7+ agent roles defined with distinct capabilities
✅ LLM-powered task decomposition working
✅ Role-based tool restrictions enforced
✅ AgentFactory creates specialized agents
✅ Enforcement rules for mandatory agents
✅ Loop detection prevents infinite recursion
✅ Context sharing between agents
✅ 50+ new tests (roles, decomposer, factory, workflow)
✅ All 442+ tests passing

---

## Sources

- [Claude Code Multi-Agent Orchestration](https://dev.to/bredmond1019/multi-agent-orchestration-running-10-claude-instances-in-parallel-part-3-29da)
- [Claude Subagents Complete Guide](https://www.cursor-ide.com/blog/claude-subagents)
- [MetaGPT Framework](https://www.ibm.com/think/topics/metagpt)
- [CrewAI vs LangGraph vs AutoGPT](https://www.concision.ai/blog/comparing-multi-agent-ai-frameworks-crewai-langgraph-autogpt-autogen)
- [Multi-Agent Security Best Practices](https://google.github.io/adk-docs/agents/multi-agents/)
- [AWS Agentic AI Security Framework](https://aws.amazon.com/blogs/security/the-agentic-ai-security-scoping-matrix-a-framework-for-securing-autonomous-ai-systems/)
