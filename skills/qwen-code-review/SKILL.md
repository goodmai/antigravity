---
name: qwen-code-review
description: A skill that uses the Qwen AI model (via gemini-cli) to review code files. Use this skill when the user asks for a code review, feedback on a specific file, or suggestions for improvement.
license: MIT
---

# Qwen Code Review Skill

This skill allows you to perform automated code reviews using the Qwen model.

## Prerequisites

- `gemini` CLI installed.
- `code-review` extension installed.

## Usage

Run the review script on a target file:

```bash
python /home/g/antigravity/skills/qwen-code-review/scripts/code_review.py <path_to_file>
```

## Features

- **Code Analysis**: Scans for bugs, style issues, and performance bottlenecks.
- **Qwen Persona**: The reviewer adopts the persona of a senior Qwen developer.
- **Report Generation**: Outputs a structured review to the console.

## Example

```bash
python /home/g/antigravity/skills/qwen-code-review/scripts/code_review.py /home/g/project/main.py
```
