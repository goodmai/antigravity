---
name: security-checker
description: A skill that uses the Gemini CLI Security extension to scan code for vulnerabilities. Use this skill to perform security audits on files.
license: MIT
---

# Security Checker Skill

This skill allows you to perform automated security audits using the Gemini Security extension.

## Prerequisites

- `gemini` CLI installed.
- `gemini-cli-security` extension installed.

## Usage

Run the security check script on a target file:

```bash
python /home/g/antigravity/skills/security-checker/scripts/check_security.py <path_to_file>
```

## Features

- **Vulnerability Scanning**: Detects common security flaws (SQLi, XSS, Hardcoded Secrets).
- **Compliance Check**: Verifies basic security best practices.
- **Reporting**: Outputs a list of detected issues.

## Example

```bash
python /home/g/antigravity/skills/security-checker/scripts/check_security.py /home/g/project/auth_service.py
```
