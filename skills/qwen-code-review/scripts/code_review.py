import subprocess
import sys
import shutil
import argparse

def main():
    parser = argparse.ArgumentParser(description="Qwen Code Review Skill")
    parser.add_argument("file_path", nargs="?", help="Path to the file to review")
    parser.add_argument("--output", help="Path to save the output report")
    parser.add_argument("--update", action="store_true", help="Update the Gemini Code Review extension")
    parser.add_argument("--system-prompt", help="Path to a system prompt text file")
    
    args = parser.parse_args()

    # Handle update report
    if args.update:
        print("🔄 Updating Code Review Extension...")
        try:
            subprocess.run(["gemini", "update", "code-review"], check=True)
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

    print("🤖 Qwen Code Reviewer Initialized...")
    print(f"📄 Analyzing file: {file_path}")
    print("-" * 50)

    try:
        # Call the gemini code-review extension
        # We assume 'gemini code-review <file>' is the syntax based on help
        result = subprocess.run(
            ["gemini", "code-review", file_path],
            capture_output=True,
            text=True
        )
        
        output_text = ""
        if result.returncode == 0:
            output_text = result.stdout
            print(output_text)
        else:
            print("Error running review:")
            print(result.stderr)
            output_text = f"Error: {result.stderr}"

        if args.output:
            with open(args.output, "w") as f:
                f.write(output_text)
            print(f"\n💾 Report saved to: {args.output}")
            
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
