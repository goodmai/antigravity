import sys
import subprocess
import os
import time
import glob
import shutil

# Cross-platform way to find Python
PYTHON_EXE = sys.executable

def run_step(description, command):
    print(f"\n🚀 {description}...")
    try:
        # shell=True is often needed for finding scripts on path, but we use absolute paths where possible
        # or relative to cwd.
        result = subprocess.run(command, check=True, text=True, shell=False)
        print(f"✅ {description} Complete.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} Failed: {e}")
        return False

def check_outputs(output_files, keywords_to_fail):
    found_issues = False
    for fpath in output_files:
        if not os.path.exists(fpath):
            continue
        with open(fpath, "r") as f:
            content = f.read()
            for kw in keywords_to_fail:
                if kw.lower() in content.lower():
                    print(f"⚠️ Issue found in {fpath}: '{kw}' detected.")
                    found_issues = True
    return found_issues

def main():
    base_dir = os.getcwd()
    skills_dir = os.path.join(base_dir, "skills")
    artifacts_dir = os.path.join(base_dir, "artifacts")
    
    # Scripts paths (assumes standard layout)
    opt_script = os.path.join(skills_dir, "prompt-optimizer", "scripts", "optimize_prompts.py")
    qwen_script = os.path.join(skills_dir, "qwen-code-review", "scripts", "code_review.py")
    sec_script = os.path.join(skills_dir, "security-checker", "scripts", "check_security.py")
    fix_script = os.path.join(skills_dir, "gemini-fixer", "scripts", "fix_code.py")
    
    target_file = "vulnerable_app.py"

    # 1. Dynamic Setup (Optimization)
    print(">>> 🧠 Phase 1: Prompt Optimization <<<")
    run_step("Optimizing Prompts", [PYTHON_EXE, opt_script, "--project-dir", ".", "--out-dir", "artifacts/config"])

    # 2. The Loop
    print("\n>>> 🔄 Phase 2: autonomous Fix Loop <<<")
    
    iteration = 0
    max_iterations = 5
    
    while iteration < max_iterations:
        iteration += 1
        timestamp = int(time.time())
        print(f"\n--- Iteration {iteration} (TS: {timestamp}) ---")

        qwen_out = os.path.join("artifacts", f"{timestamp}_qwen.txt")
        sec_out = os.path.join("artifacts", f"{timestamp}_sec.txt")
        
        # Tuned prompts paths
        qwen_prompt_file = os.path.join("artifacts", "config", "qwen_prompt.txt")
        sec_prompt_file = os.path.join("artifacts", "config", "sec_prompt.txt")

        # Run Review (with Tuned Prompt)
        run_step("Running Code Review", [PYTHON_EXE, qwen_script, target_file, "--output", qwen_out, "--system-prompt", qwen_prompt_file])
        run_step("Running Security Check", [PYTHON_EXE, sec_script, target_file, "--output", sec_out, "--system-prompt", sec_prompt_file])

        # Check Exit Criteria
        # "Issue" or "High" or "Critical" are commonly what we look for to FAIL.
        # If we find them, we fix. If not, we break.
        issues_found = check_outputs([qwen_out, sec_out], ["High", "Critical", "Vulnerability", "Issue"])

        if not issues_found:
            print(f"\n✅ No critical issues found! Code is clean. Exiting loop.")
            break
        
        # Parse context for fixer
        context_files = [qwen_out, sec_out]
        
        # Run Fixer
        print("🛠️ Transforming code with Gemini Fixer...")
        # Note: We are not passing system prompts to fixer yet, but we could.
        cmd = [PYTHON_EXE, fix_script, "--target", target_file, "--context"] + context_files
        run_step("Applying Fixes", cmd)

        time.sleep(2)

    if iteration == max_iterations:
        print("⚠️ Max iterations reached. Please check the code manually.")

if __name__ == "__main__":
    main()
