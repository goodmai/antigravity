import os
import argparse
import subprocess
import shutil

def main():
    parser = argparse.ArgumentParser(description="Prompt Optimizer Meta-Skill")
    parser.add_argument("--project-dir", default=".", help="Project directory to analyze")
    parser.add_argument("--out-dir", default="artifacts/config", help="Output directory for tuned prompts")
    args = parser.parse_args()

    project_dir = args.project_dir
    out_dir = args.out_dir
    
    # Ensure output directory exists (Multi-platform safe)
    os.makedirs(out_dir, exist_ok=True)
    
    print(f"🧠 Prompt Optimizer Analysis started on: {project_dir}")

    # 1. Analyze Project Type (Simple heuristic)
    is_python = False
    is_web = False
    
    for root, _, files in os.walk(project_dir):
        for file in files:
            if file.endswith(".py"):
                is_python = True
            if file.endswith(".html") or file.endswith(".js"):
                is_web = True
    
    project_type = "General"
    if is_python and is_web:
        project_type = "Full Stack Python/Web"
    elif is_python:
        project_type = "Python Backend"
    elif is_web:
        project_type = "Frontend Web"

    print(f"📊 Detected Project Type: {project_type}")

    # 2. Generate Tuned Prompts (CO-STAR Framework)
    
    # Qwen System Prompt
    qwen_prompt = f"""
# CONTEXT
You are a Lead Code Reviewer specializing in {project_type}.

# OBJECTIVE
Analyze the provided code for style, maintainability, and logical errors. 
Focus specifically on best practices for {project_type}.

# STYLE
Concise, constructive, and educational.

# TONE
Professional and encouraging.

# AUDIENCE
Junior to Mid-level developers.

# RESPONSE FORMAT
- Summary of changes
- Itemized list of issues (High/Medium/Low)
- Refactoring suggestions
    """
    
    # Security System Prompt
    sec_prompt = f"""
# CONTEXT
You are a Paranoid Security Auditor specializing in {project_type}.

# OBJECTIVE
Scan the code for OWASP Top 10 vulnerabilities and hardcoded secrets.
Be extremely aggressive in flagging potential risks.

# STYLE
Strict, technical, and risk-focused.

# TONE
Warning and Urgent.

# RESPONSE FORMAT
- VULNERABILITY: [Name] (Severity: High/Critical)
- DESCRIPTION: [Details]
- FIX: [Code snippet]
    """

    # 3. Write Prompts to Artifacts
    qwen_path = os.path.join(out_dir, "qwen_prompt.txt")
    sec_path = os.path.join(out_dir, "sec_prompt.txt")
    
    with open(qwen_path, "w") as f:
        f.write(qwen_prompt.strip())
        
    with open(sec_path, "w") as f:
        f.write(sec_prompt.strip())
        
    print(f"✅ Tuned prompts generated in {out_dir}:")
    print(f"  - {qwen_path}")
    print(f"  - {sec_path}")

if __name__ == "__main__":
    main()
