import subprocess
import sys
import shutil
import argparse
import os

def main():
    parser = argparse.ArgumentParser(description="Gemini Fixer Skill")
    parser.add_argument("--target", required=True, help="Target file to fix")
    parser.add_argument("--context", nargs="+", help="Context files (review reports)")
    
    args = parser.parse_args()
    
    target_file = args.target
    context_files = args.context or []
    
    if not shutil.which("gemini"):
        print("Error: 'gemini' CLI not found.")
        sys.exit(1)

    print(f"🔧 Gemini Fixer Initialized for {target_file}...")

    # Construct the prompt context
    context_content = ""
    for cf in context_files:
        if os.path.exists(cf):
            with open(cf, "r") as f:
                context_content += f"\n--- Report ({cf}) ---\n{f.read()}\n"
    
    prompt = f"""
    You are an expert software engineer.
    The file '{target_file}' has identified issues.
    
    Here are the review reports:
    {context_content}
    
    Please REWRITE the content of '{target_file}' to fix these issues. 
    Ensure the code is secure, functional, and follows best practices.
    Output ONLY the fixed code content, no markdown blocks.
    """
    
    try:
        # Using gemini prompt to generate the fix
        # Assuming 'gemini prompt' takes the prompt as argument
        # Ideally we pipe the target file content too
        
        with open(target_file, "r") as tf:
            target_content = tf.read()

        full_prompt = f"{prompt}\n\nCurrent File Content:\n{target_content}"
        
        # Call gemini with specific model "gemini-1.5-pro" (mapped to gemini-pro 3 req)
        # Note: CLI args might vary based on version, using standard 'prompt'
        result = subprocess.run(
            ["gemini", "prompt", full_prompt, "--model", "gemini-1.5-pro"],
            capture_output=True,
            text=True,
            env=os.environ.copy()
        )
        
        if result.returncode == 0:
            fixed_code = result.stdout
            # Remove markdown code blocks if present (simple heuristic)
            fixed_code = fixed_code.replace("```python", "").replace("```", "").strip()
            
            with open(target_file, "w") as f:
                f.write(fixed_code)
            print(f"✅ File {target_file} has been updated with fixes.")
        else:
            print("❌ Failed to generate fix.")
            print(result.stderr)
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
