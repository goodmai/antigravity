import os
import subprocess
import re

def convert_md_to_html(md_path, html_path, title, template_path):
    print(f"Converting {md_path} to {html_path}...")
    
    # Run pandoc
    # --template placeholder replaces $body$ in template
    # --metadata title="$title$" replaces $title$ in template
    try:
        subprocess.run([
            "pandoc",
            md_path,
            "-o", html_path,
            "--template", template_path,
            "--metadata", f"title={title}",
            "--from", "gfm" # GitHub Flavored Markdown
        ], check=True)
        
        # Post-process the generated HTML to fix relative links
        with open(html_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # 1. Fix link to README.md -> index.html
        content = content.replace('README.md', 'index.html')
        
        # 2. Fix potential image paths and other absolute links
        content = content.replace('file:///home/g/antigravity/', '../')
        
        # 3. Ensure Cyrillic is properly handled even if pandoc entities them (though without --ascii it should be fine)
        # But we'll leave it simple for now.
        
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(content)
            
    except subprocess.CalledProcessError as e:
        print(f"Error converting {md_path}: {e}")

def main():
    base_dir = "lessons"
    template_path = os.path.join(base_dir, "template.html")
    
    if not os.path.exists(template_path):
        print(f"Template not found at {template_path}")
        return

    # Process lessons
    for root, dirs, files in os.walk(base_dir):
        if "README.md" in files:
            md_path = os.path.join(root, "README.md")
            html_path = os.path.join(root, "index.html")
            
            # Extract title from the first H1 in README.md
            title = "Lesson"
            with open(md_path, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.startswith("# "):
                        title = line[2:].strip()
                        break
            
            convert_md_to_html(md_path, html_path, title, template_path)

    # Process labs
    labs_dir = "labs"
    if os.path.exists(labs_dir):
        for root, dirs, files in os.walk(labs_dir):
            if "README.md" in files:
                md_path = os.path.join(root, "README.md")
                html_path = os.path.join(root, "index.html")
                
                # Title extraction
                title = "Lab"
                with open(md_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        if line.startswith("# "):
                            title = line[2:].strip()
                            break
                
                # Template path for labs needs to be adjusted since they are at the same level as lessons
                # or we can use an absolute path for the template
                abs_template_path = os.path.abspath(template_path)
                convert_md_to_html(md_path, html_path, title, abs_template_path)

if __name__ == "__main__":
    main()
