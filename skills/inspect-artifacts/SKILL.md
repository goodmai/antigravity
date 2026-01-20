---
name: Inspect Artifacts
description: Quickly lists the contents of the current conversation's artifact directory (implementation plans, tasks, etc.).
---

# Inspect Artifacts Skill

This skill is designed to help you quickly locate and list the files in the current conversation's artifact directory, where files like `implementation_plan.md`, `task.md`, and `walkthrough.md` are stored.

## Instructions

When the user asks to "inspect artifacts", "check artifacts", or similar:

1.  **Identify the Artifact Directory**:
    *   Look for the `Artifact Directory Path` provided in your `<agentic_mode_overview>` system prompt block.
    *   It typically looks like: `/home/<user>/.gemini/antigravity/brain/<conversation-id>`.

2.  **List Directory Contents**:
    *   Use the `run_command` tool.
    *   Execute `ls -la <Artifact_Directory_Path>`.
    *   **Do not** change directory (`cd`) to it effectively; just list it by path.

3.  **Present Results**:
    *   Display the output of the `ls -la` command to the user so they can see what artifacts exist.
