# effector-compose

[![npm version](https://img.shields.io/badge/npm-effector--compose-E03E3E.svg)](https://www.npmjs.com/package/effector-compose)
[![CI](https://github.com/effectorHQ/effector-compose/actions/workflows/test.yml/badge.svg)](https://github.com/effectorHQ/effector-compose/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#)

**Type-checked composition engine for AI agent capabilities.**

---

## The Composition Problem

You have a code-review skill, a security-scan tool, and a Slack notification skill. You want to chain them: on every PR, run review and security scan in parallel, then notify the team.

Today, you write this by hand — a LangGraph state machine, a Lobster pipeline, a CrewAI crew. You wire the tools together, run it, and discover at runtime that the security scanner outputs a format the notification skill can't parse. You debug for an hour. You add format conversion glue code. You run it again. The review tool expects a `Repository` context that you forgot to provide. Another hour.

**67% of multi-agent system failures come from these composition errors** — not from individual tool bugs, but from the interfaces between them ([arXiv:2501.06322](https://arxiv.org/abs/2501.06322)).

`effector-compose` solves this by type-checking the entire pipeline before execution.

## Install

```bash
npm install effector-compose
```

You can also use the CLI directly without installing globally:

```bash
npx effector-compose pipeline.toml
```

See the published package on npm: **https://www.npmjs.com/package/effector-compose**

## How It Works

### Define a pipeline

```yaml
# pipeline.effector.yml
name: pr-review-pipeline
version: 1.0.0

steps:
  - id: review
    effector: code-review@1.2.0
    input: $trigger.diff

  - id: security
    effector: security-scan@2.0.0
    input: $trigger.diff
    parallel-with: review

  - id: report
    effector: aggregate-report@1.0.0
    input:
      review: $review.output
      security: $security.output

  - id: notify
    effector: slack-notify@0.5.0
    input: $report.output
    condition: $report.output.severity != "none"
```

### Type-check it

```bash
npx effector-compose check ./pipeline.effector.yml

  Step 1: review
    ✓ Input type CodeDiff matches code-review@1.2.0 interface
    ✓ Context [Repository] available from trigger

  Step 2: security (parallel with review)
    ✓ Input type CodeDiff matches security-scan@2.0.0 interface
    ✓ No dependency on review output — parallel execution safe

  Step 3: report
    ✓ Input types [ReviewReport, SecurityReport] match aggregate-report@1.0.0
    ✓ Structural subtyping: SecurityReport satisfies ReportLike constraint

  Step 4: notify (conditional)
    ✓ Input type AggregateReport matches slack-notify@0.5.0
    ✓ Condition references valid field: severity

  Pipeline type-check: PASSED (4/4 steps valid)
  Estimated cost: ~0.08 USD per invocation
  Required permissions: [read:repository, network:slack.com]
```

**The entire pipeline is verified before a single token is spent.** Type mismatches, missing contexts, invalid parallel execution, and permission conflicts are caught at definition time.

### Execute it

```bash
npx effector-compose run ./pipeline.effector.yml --trigger '{"diff": "..."}'
```

The engine handles:
- **Parallel execution** of independent steps (review and security run simultaneously)
- **Type coercion** where structural subtyping allows it
- **Error propagation** with typed error channels
- **Cost tracking** per step and aggregate
- **Fallback execution** when a step fails and alternatives exist

## Why Not Just Use LangGraph / Lobster / CrewAI?

Good question. Those tools orchestrate agent execution. `effector-compose` operates at a different layer:

| Aspect | LangGraph / Lobster / CrewAI | effector-compose |
|--------|---------------------------|-----------------|
| **Scope** | Runtime orchestration | **Composition verification + orchestration** |
| **Type safety** | None (runtime errors) | **Compile-time type checking** |
| **Cross-runtime** | Framework-locked | **Works with any runtime** |
| **Cost awareness** | None | **Per-step cost estimates, budget constraints** |
| **Discovery** | Manual tool selection | **Type-based auto-discovery of compatible steps** |

`effector-compose` can **emit** LangGraph state machines, Lobster pipelines, or CrewAI crew definitions as output targets. It's the layer above orchestration — it verifies your composition is correct, then generates the runtime-specific configuration.

```bash
# Type-check, then output as Lobster pipeline
npx effector-compose build ./pipeline.effector.yml --target lobster

# Type-check, then output as LangGraph state machine
npx effector-compose build ./pipeline.effector.yml --target langgraph
```

## The Composition Algebra

`effector-compose` implements the composition algebra defined in [effector-spec](https://github.com/effectorHQ/effector-spec):

### Sequential (→)

```
A → B
```
Requires: `OutputType(A)` is a structural subtype of `InputType(B)`.

### Parallel (‖)

```
A ‖ B → C
```
A and B execute simultaneously. C receives `[OutputType(A), OutputType(B)]` as a tuple.

### Conditional (?)

```
A → (predicate) ? B : C
```
Predicate operates on `OutputType(A)`. B and C must have compatible output types (union type).

### Fallback (|)

```
A | B
```
If A fails, B executes. Requires: `InputType(A) == InputType(B)` and `OutputType(A) ≈ OutputType(B)`.

### Budget Constraint ($)

```
A → B → C    budget: 0.10 USD
```
If estimated cost exceeds budget, the engine suggests cheaper alternative Effectors with compatible types.

## Smart Features

### Auto-Discovery

Don't know which Effectors to use? Describe what you want:

```bash
npx effector-compose suggest \
  --input CodeDiff \
  --output "notification to team about code quality"

  Suggested pipeline (3 steps, ~0.06 USD):
    1. code-review@1.2.0     CodeDiff → ReviewReport
    2. quality-score@0.8.0   ReviewReport → QualityScore
    3. slack-notify@0.5.0    QualityScore → Notification

  Alternative pipeline (2 steps, ~0.03 USD):
    1. quick-review@2.0.0    CodeDiff → QualitySummary
    2. slack-notify@0.5.0    QualitySummary → Notification
```

### Dependency Resolution

Effectors can declare dependencies on other Effectors. `effector-compose` resolves the full dependency tree:

```bash
npx effector-compose resolve ./pipeline.effector.yml

  Required Effectors:
    code-review@1.2.0      (direct)
    security-scan@2.0.0    (direct)
    aggregate-report@1.0.0 (direct)
    slack-notify@0.5.0     (direct)
    gh-client@3.1.0        (dependency of code-review)
    sarif-parser@1.0.0     (dependency of security-scan)

  All dependencies resolved. No conflicts.
```

### Visualization

Generate visual pipeline diagrams (integrates with [effector-graph](https://github.com/effectorHQ/effector-graph)):

```bash
npx effector-compose visualize ./pipeline.effector.yml --format svg
```

## Roadmap

- [x] **v0.1** — Pipeline YAML format, sequential type-checking, CLI, registry loader
- [x] **v0.2** — Type checker backed by effector-types/types.json (alias resolution, subtype relations)
- [ ] **v0.3** — Parallel composition, conditional branching
- [ ] **v0.3** — Auto-discovery, pipeline suggestion
- [ ] **v0.4** — Build targets (Lobster, LangGraph, CrewAI)
- [ ] **v0.5** — Cost tracking, budget constraints
- [ ] **v1.0** — Production-ready composition engine

## Contributing

The composition engine needs:

- **Runtime adapters** — Help us generate configurations for your favorite orchestration framework
- **Type inference** — Improve the engine's ability to infer types from untyped Effectors
- **Real-world pipelines** — Submit your agent workflows as test cases for the type checker
- **Performance** — The type checker should be fast enough for IDE integration

## License

[MIT](./LICENSE)

---

<sub>Part of the <a href="https://github.com/effectorHQ">effectorHQ</a> studio. We build hands for AI.</sub>
