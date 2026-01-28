---
description: Reusable workflow to archive reporting artifacts with timestamps.
---

# Artifact Archival Workflow

This workflow moves specified files to the `../artifacts` directory, prepending a timestamp to their filenames.

## Steps

1.  **Preparation**
    Ensure the artifacts directory exists.
    ```bash
    mkdir -p ../artifacts
    ```

// turbo 2. **Archive Files**
Move report files. (Expects `qwen_report.txt` and `security_report.txt` to exist in current dir).
```bash
TIMESTAMP=$(date +%s)

    if [ -f "qwen_report.txt" ]; then
        mv qwen_report.txt "../artifacts/${TIMESTAMP}_qwen.txt"
        echo "Archived qwen_report.txt -> ../artifacts/${TIMESTAMP}_qwen.txt"
    fi

    if [ -f "security_report.txt" ]; then
        mv security_report.txt "../artifacts/${TIMESTAMP}_security.txt"
        echo "Archived security_report.txt -> ../artifacts/${TIMESTAMP}_security.txt"
    fi
    ```
