---
description: Run the Full QA Cycle (Meta-Skill Tester)
---

# QA Suite Workflow

This workflow executes the `qa-skill-tester` meta-skill. It validates a specific skill by generating test plans, checklists (XLSX), and bug reports (DOCX).

## Usage

`workflow qa-suite --skill <path_to_skill>`

## Steps

1.  **Optimize Prompts** (The Brain)
    Generate QA personas (QA Lead, Test Architect).

    ```bash
    python3 skills/qa-skill-tester/scripts/optimize_qa_prompts.py
    ```

2.  **Execute QA Runner** (The Hands)
    Run the orchestrator in the virtual environment.
    Note: Replace `skills/qwen-code-review` with your target skill if needed.
    ```bash
    TARGET_SKILL=${1:-skills/qwen-code-review}
    skills/qa-skill-tester/.venv/bin/python3 skills/qa-skill-tester/scripts/run_qa.py --skill "$TARGET_SKILL"
    ```

// turbo 3. **Archive**
(Optional Step as run_qa.py handles archival internally, but we add redundant check).
`run_workflow artifact-archival`

4.  **Visual Proof**
    If UI bugs are found, take a screenshot.
    `@/SCR`
