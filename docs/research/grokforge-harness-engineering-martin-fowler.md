# Harness Engineering – Key Points from Martin Fowler + GrokForge Applications

**Source:** [Harness Engineering for Coding Agent Users](https://martinfowler.com/articles/harness-engineering.html) by Martin Fowler

This document extracts the most relevant ideas and maps them to GrokForge’s harness development.

---

## Core Idea

A **harness** is everything around the model (prompts, tools, orchestration, feedback loops, sensors, guides) that makes an agent reliable with minimal human supervision.

The goal of harness engineering is to:
- Increase the chance of correct output on the first try
- Provide fast feedback so the agent can self-correct
- Reduce the amount of review toil required from the user
- Build trust in the agent over time

**GrokForge Implication:**
Many of our current issues (crushed code, bloated files, weak recovery) are harness problems. We need to systematically add guides and sensors that prevent these failure modes.

---

## Key Principles

### Feedforward vs Feedback

- **Feedforward (Guides):** Rules, prompts, conventions, and constraints applied *before* the agent acts (e.g. system prompts, AGENTS.md, edit policies).
- **Feedback (Sensors):** Mechanisms that observe the result *after* an action and provide correction (e.g. linters, tests, validation hooks, diagnostics).

**Best harnesses combine both.** Feedforward-only agents repeat the same mistakes. Feedback-only agents waste tokens re-learning lessons.

**GrokForge Opportunity:**
- We have some feedforward (profiles, prompts).
- We are weak on fast feedback/sensors for proposed edits.
- Adding lightweight sensors (pre-validation, formatting checks) before showing diffs would be high leverage.

### Computational vs Inferential Controls

- **Computational controls:** Deterministic, fast, cheap (linters, type checkers, structural tests, formatters).
- **Inferential controls:** Semantic, slower, non-deterministic (LLM-based reviews, semantic analysis).

**Recommendation:** Use fast computational controls early (pre-commit / pre-proposal) and more expensive inferential ones later or selectively.

**GrokForge Application:**
Our current validation is mostly inferential (model deciding). Adding cheap computational checks (formatting, basic structure, line count heuristics) before showing a proposal would be very valuable.

### Steering Loop (Human + AI improving the harness)

Humans should iteratively improve the harness based on recurring failures. AI can help generate tests, rules, or even parts of the harness itself.

This matches the "ratchet principle" from Addy Osmani's article.

---

## Types of Harnesses (Useful Categorization)

Fowler breaks harnesses into categories. This is helpful for prioritizing work in GrokForge:

| Type                    | What it regulates              | Difficulty | GrokForge Priority | Notes |
|-------------------------|--------------------------------|------------|--------------------|-------|
| **Maintainability Harness** | Code quality, style, complexity, structure | Easiest    | **High**           | Linting, formatting, basic structural rules |
| **Architecture Fitness Harness** | Architectural characteristics (boundaries, performance, observability) | Medium     | Medium             | More advanced fitness functions |
| **Behavior Harness**    | Functional correctness         | Hardest    | Medium-Long term   | Tests, specs, self-verification |

**Recommendation for GrokForge:**
Start by heavily strengthening the **Maintainability Harness** (catching crushed code, formatting issues, bloated files). This is the fastest win and directly addresses our current pain.

---

## Key Techniques & Practices

### Keep Quality "Left"
Apply fast, cheap controls as early as possible (before the user sees a proposal). Run more expensive checks later.

**GrokForge Translation:**
- Add cheap pre-validation on `propose_file_edits` (formatting, size, basic structure).
- This prevents bad diffs from ever reaching the user.

### Combine Guides + Sensors
- **Guides** tell the agent how to behave.
- **Sensors** verify whether it actually did.

Both are needed. Guides without sensors lead to silent failures. Sensors without good guides lead to repeated mistakes.

### Build "Harnessability" into the System
Make it easy for the harness to observe and control the codebase (good types, clear boundaries, testable structure).

For GrokForge itself, this means making our own code easier to observe and validate (good observability in the harness, clear contracts between components).

### Continuous Sensors for Drift
Not everything needs to run on every change. Some sensors should run continuously to detect gradual quality erosion (dead code, complexity growth, etc.).

---

## Actionable Takeaways for GrokForge

| Area                        | Martin Fowler Insight                     | Current GrokForge State          | Recommended Focus |
|----------------------------|-------------------------------------------|----------------------------------|-------------------|
| **Pre-proposal Validation** | Fast computational sensors early         | Weak                             | Add lightweight formatting + structural checks before showing diffs (Story 146) |
| **Anti-crush / Quality**   | Maintainability harness is the easiest win | Still recurring issues           | Strengthen formatting & structure rules aggressively |
| **Recovery & Feedback**    | Make failures visible and actionable     | Exists but can be noisy          | Improve quality of rejection feedback |
| **Incremental vs Large Edits** | Prefer smaller, verifiable steps       | Sometimes overreaches            | Continue improving incremental editing strategy |
| **Long-running Tasks**     | Use planning + self-verification         | Plan mode exists                 | Strengthen post-plan verification |
| **Observability**          | Traces + sensors                         | Improving                        | Continue enhancing harness metrics and traces |
| **Rules / Memory**         | Short, earned guides + sensors           | Scattered                        | Consider consolidating high-value rules |

---

## Prioritized Recommendations

1. **Double down on Maintainability Harness** (highest ROI right now)
   - Strong pre-validation on proposals
   - Clear formatting and structural rules
   - Size/change heuristics to prevent bloat

2. **Improve the balance of Guides + Sensors**
   - We have decent guides (prompts/profiles).
   - We need faster, cheaper sensors that run before the user sees output.

3. **Continue the Steering Loop**
   - Every time we see a recurring failure (crushed code, bad recovery, etc.), treat it as a signal to permanently improve the harness.

4. **Layer Controls by Cost and Timing**
   - Cheap + fast checks → before proposal is shown
   - More expensive checks → after apply or in background

5. **Keep evolving the harness deliberately**
   - Start simple (v0.1 harness)
   - Add constraints based on real failures
   - Remove or relax rules as models improve

---

## Final Thought

Martin Fowler’s framing reinforces what we’ve been discovering empirically:

> The biggest lever we have right now is **not** swapping to a stronger model — it’s building a tighter, more disciplined harness around the models we already have.

The combination of:
- Early computational checks (pre-validation)
- Clear maintainability rules
- Good feedback when things go wrong
- A deliberate "ratchet" mindset on recurring failures

…should significantly improve GrokForge’s reliability on the exact classes of problems we’ve been seeing (crushed output, bloated files, weak recovery).

This pairs very well with the notes from Addy Osmani's article. Together they give us a strong foundation for harness engineering work.