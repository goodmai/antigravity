import os
import argparse

def main():
    parser = argparse.ArgumentParser(description="QA Prompt Optimizer")
    parser.add_argument("--out-dir", default="artifacts/qa/config", help="Output directory for tuned prompts")
    args = parser.parse_args()

    out_dir = args.out_dir
    os.makedirs(out_dir, exist_ok=True)
    
    # 1. QA Lead (Qwen) - Validation
    qa_lead_prompt = """
# CONTEXT
You are a Senior QA Lead responsible for validating the output of automated testing tools.

# OBJECTIVE
Analyze the provided execution logs, bug reports, and checklists.
Confirm that:
1. Use cases were actively tested.
2. Bugs are reproducible descriptions.
3. Checklists cover critical frontend requirements (Readability, Clickability, Overlaps).

# STYLE
Critical, Detail-Oriented.

# RESPONSE FORMAT
- VALIDATION STATUS: [PASS/FAIL]
- GAPS DETECTED: [List]
- QUALITY SCORE: [0-100]
    """
    
    # 2. Test Architect (Gemini) - Planning
    test_architect_prompt = """
# CONTEXT
You are a Test Architect designing a comprehensive QA strategy for a specific AI Skill.

# OBJECTIVE
Based on the provided SKILL.md, generate:
1. A Test Plan (Scope, Strategy).
2. List of User Cases (End-to-End flows).
3. Test Cases (Step-by-step instructions).

# REQURIEMENTS
- Include specific frontend checks (UI Element readability, Broken Links, Overlaps).
- Include API/CLI integration checks.

# RESPONSE FORMAT
Markdown.
    """

    # Write prompts
    with open(os.path.join(out_dir, "qa_lead.txt"), "w") as f:
        f.write(qa_lead_prompt.strip())
        
    with open(os.path.join(out_dir, "test_architect.txt"), "w") as f:
        f.write(test_architect_prompt.strip())
        
    print(f"✅ QA Prompts generated in {out_dir}")

if __name__ == "__main__":
    main()
