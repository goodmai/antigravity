import subprocess
import sys
import shutil
import os
import shlex
import argparse

def main():
    parser = argparse.ArgumentParser(description="Security Checker Skill")
    parser.add_argument("file_path", nargs="?", help="Path to the file to scan")
    parser.add_argument("--output", help="Path to save the output report")
    parser.add_argument("--update", action="store_true", help="Update the Gemini Security extension")
    parser.add_argument("--system-prompt", help="Path to a system prompt text file")
    
    args = parser.parse_args()

    # Handle update
    if args.update:
        print("🔄 Updating Security Extension...")
        try:
            subprocess.run(["gemini", "update", "gemini-cli-security"], check=True, shell=True)
            print("✅ Update complete.")
        except subprocess.CalledProcessError as e:
            print(f"❌ Update failed: {e}")
        return

    if not args.file_path:
        parser.print_help()
        sys.exit(1)

    file_path = args.file_path
    
    # Check if gemini is installed
    if not shutil.which("gemini"):
        print("Error: 'gemini' CLI not found. Please install it.")
        sys.exit(1)

    print("🛡️ Security Checker Initialized...")
    print(f"🔒 Scanning file: {file_path}")
    print("-" * 50)

    try:
        # Use shell=True to ensure we preserve the user's shell environment (vars, paths, aliases)
        # Quote the file path to handle spaces safely
        quoted_path = shlex.quote(file_path)
        command = f"gemini gemini-cli-security {quoted_path}"
        
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            env=os.environ.copy() # Explicitly pass the current environment
        )
        
        output_text = ""
        if result.returncode == 0:
            print(result.stdout)
            output_text = result.stdout
        else:
            print("Security Check Failed or Issues Found:")
            print(result.stdout) # Tools often output findings to stdout
            output_text = f"{result.stdout}\n\nErrors:\n{result.stderr}"
            if result.stderr:
                print("\nErrors:")
                print(result.stderr)
        
        if args.output:
            with open(args.output, "w") as f:
                f.write(output_text)
            print(f"\n💾 Report saved to: {args.output}")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
