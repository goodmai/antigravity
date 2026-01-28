---
name: gemini-fixer
description: A skill that uses Gemini 1.5 Pro to automatically fix code issues based on review reports (traceability artifacts).
license: MIT
---

# Gemini Fixer Skill

This skill autonomously fixes code vulnerabilities and bugs by analyzing reports from other skills.

## Prerequisites

- `gemini` CLI installed.
- `GEMINI_API_KEY` set.

## Usage

```bash
python scripts/fix_code.py --target <file_to_fix> --context <report1> <report2> ...
```

## Features

- **Context-Aware Fixes**: Reads Qwen and Security Checker reports.
- **Auto-Apply**: Overwrites the target file with the fixed version logic.
