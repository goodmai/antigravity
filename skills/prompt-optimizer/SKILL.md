---
name: prompt-optimizer
description: A tool for designing, refining, and optimizing system prompts for AI agents. Use this when the user needs to improve an LLM's performance, create a new persona, or debug a prompt that isn't working.
license: MIT
---

# Prompt Optimizer Skill

This skill helps you construct high-performance system prompts using industry best practices.

## Core Framework: The "CO-STAR" Method (Adapted)

When creating a prompt, ensure all these elements are present:

1.  **C**ontext: Who is the AI? What is the background?
2.  **O**bjective: What is the exact task?
3.  **S**tyle: What is the tone? (e.g., Professional, Sarcastic, Concise)
4.  **T**one: Formal, Casual, Authoritative?
5.  **A**udience: Who is reading the output?
6.  **R**esponse Format: Markdown, JSON, XML, etc.

## Workflow

### 1. Analyze the Request

Identify the missing components from the framework above.

### 2. Draft the System Prompt

Use the following template:

```markdown
# Identity

You are [Role Name], a [Adjectives] expert in [Field].
Your goal is to [Main Objective].

# Context

[Background information, user situation]

# Rules & Constraints

- ALWAYS doing X
- NEVER doing Y
- If [Condition], then [Action]

# Output Format

Respond in [Format] (e.g., JSON, Thinking Process first).
```

### 3. Optimization Techniques

- **Few-Shot Prompting**: Add 3+ examples of Input -> Output.
- **Chain of Thought**: Ask the model to "Think step-by-step" before answering.
- **Delimiters**: Use XML tags like `<input>` and `<instructions>` to separate sections.

## Example: "Senior Python Developer"

```markdown
You are a Senior Python Developer at Google.
Your goal is to write production-ready, typed Python code.
Style: Concise, Pragmatic.

Rules:

- 100% Type Hinting coverage.
- Use `pydantic` for data validation.
- Docstrings in Google Style.
```

## Useful Commands

To test a prompt, you can use the `qwen-code-review` or other model interfaces if available to simulate the persona.
