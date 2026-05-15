import os
import glob
import re

lessons_dir = 'lessons'
review_file = 'review.md'

lessons = []
for entry in os.listdir(lessons_dir):
    path = os.path.join(lessons_dir, entry)
    if os.path.isdir(path) and entry.isdigit() or entry == 'claude-code':
        lessons.append(entry)

# Sort numerically for digits, put others at the end
def sort_key(x):
    if x.isdigit():
        return int(x)
    return 99999

lessons.sort(key=sort_key)

with open(review_file, 'w', encoding='utf-8') as f:
    f.write('# Ревью Уроков\n\n')
    f.write('| Папка | Название (из README) | Наличие README.md | Наличие index.html | Слов в README | Замечания |\n')
    f.write('|-------|----------------------|-------------------|--------------------|---------------|-----------|\n')
    
    for lesson in lessons:
        lesson_dir = os.path.join(lessons_dir, lesson)
        readme_path = os.path.join(lesson_dir, 'README.md')
        index_path = os.path.join(lesson_dir, 'index.html')
        
        has_readme = os.path.exists(readme_path)
        has_index = os.path.exists(index_path)
        
        title = "N/A"
        word_count = 0
        issues = []
        
        if has_readme:
            with open(readme_path, 'r', encoding='utf-8') as rf:
                content = rf.read()
                word_count = len(content.split())
                
                # Extract title
                match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
                if match:
                    title = match.group(1).strip()
                else:
                    issues.append("Нет заголовка H1")
                    
                if word_count < 100:
                    issues.append("Очень короткий README")
        else:
            issues.append("Отсутствует README.md")
            
        if not has_index:
            issues.append("Отсутствует index.html")
            
        if not issues:
            issues_str = "ОК"
        else:
            issues_str = ", ".join(issues)
            
        has_readme_str = "✅" if has_readme else "❌"
        has_index_str = "✅" if has_index else "❌"
        
        f.write(f'| {lesson} | {title} | {has_readme_str} | {has_index_str} | {word_count} | {issues_str} |\n')

print(f"Review completed and saved to {review_file}")
