---
description: Automated Security & Code Quality Workflow (Senior Edition)
---

# Security Check Workflow

This workflow performs a "Senior-Level" audit of your code. It dynamically utilizes Prompt Optimization to tune the reviewers before execution.

## Steps

1.  **Preparation**
    Ensure `GEMINI_API_KEY` is set.

    ```bash
    if [ -z "$GEMINI_API_KEY" ]; then echo "Error: GEMINI_API_KEY not set"; exit 1; fi
    mkdir -p artifacts/config
    ```

2.  **Prompt Optimization (The Brain)**
    Analyze the project and generate tuned prompts.

    ```bash
    python /home/g/antigravity/skills/prompt-optimizer/scripts/optimize_prompts.py --project-dir . --out-dir artifacts/config
    ```

3.  **Code Review (The Reviewer)**
    Run Qwen with the tuned prompt.

    ```bash
    python /home/g/antigravity/skills/qwen-code-review/scripts/code_review.py <target_file> \
      --output qwen_report.txt \
      --system-prompt artifacts/config/qwen_prompt.txt
    ```

4.  **Security Scan (The Auditor)**
    Run Security Checker with the tuned prompt.
    ```bash
    python /home/g/antigravity/skills/security-checker/scripts/check_security.py <target_file> \
      --output security_report.txt \
      --system-prompt artifacts/config/sec_prompt.txt
    ```

// turbo 5. **Artifact Archival**
Archive the reports with timestamps.
`run_workflow artifact-archival`

6.  **Next Steps**
    If issues were found, run the Fixer:
    `python /home/g/antigravity/skills/gemini-fixer/scripts/fix_code.py --target <target_file> --context qwen_report.txt security_report.txt`
