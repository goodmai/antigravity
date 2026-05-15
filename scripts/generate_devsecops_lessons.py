#!/usr/bin/env python3
"""Generate individual lesson HTML pages for the CI/CD DevSecOps Mastery course."""

import os
import re

COURSE_DIR = os.path.join(os.path.dirname(__file__), '..', 'academy', 'courses', 'cicd-devsecops')

# Lesson metadata: (module, lesson, dir_key, title, badge, module_title)
LESSONS = [
    # Module 0
    (0, 1, '0-foundations', 'DevSecOps как поток ценности', 'mindset', 'Foundations & Mindset'),
    (0, 2, '0-foundations', 'Threat modeling за 30 минут', 'STRIDE', 'Foundations & Mindset'),
    (0, 3, '0-foundations', 'Зрелость: OWASP SAMM & DSOMM', 'maturity', 'Foundations & Mindset'),
    # Module 1
    (1, 1, '1-cicd-foundations', 'Анатомия пайплайна', 'pipelines', 'CI/CD Foundations'),
    (1, 2, '1-cicd-foundations', 'Git workflows', 'git', 'CI/CD Foundations'),
    (1, 3, '1-cicd-foundations', 'Git hooks: client + server', 'hooks', 'CI/CD Foundations'),
    (1, 4, '1-cicd-foundations', 'GitHub Actions глубоко', 'actions', 'CI/CD Foundations'),
    (1, 5, '1-cicd-foundations', 'Runners: hosted vs self-hosted, ARC', 'runners', 'CI/CD Foundations'),
    # Module 2
    (2, 1, '2-packaging', 'Ubuntu/Debian: .deb, PPA, репозитории', 'deb', 'Multi-platform Packaging'),
    (2, 2, '2-packaging', 'Snap & Flatpak', 'snap', 'Multi-platform Packaging'),
    (2, 3, '2-packaging', 'Homebrew: formula, tap, bottle', 'brew', 'Multi-platform Packaging'),
    (2, 4, '2-packaging', 'iOS: Xcode + fastlane', 'iOS', 'Multi-platform Packaging'),
    (2, 5, '2-packaging', 'Android: AAB, signing, Play Store', 'android', 'Multi-platform Packaging'),
    (2, 6, '2-packaging', 'Кросс-платформенные артефакты', 'GoReleaser', 'Multi-platform Packaging'),
    # Module 3
    (3, 1, '3-containers-k8s', 'Docker правильно', 'docker', 'Containers, K8s, Pods'),
    (3, 2, '3-containers-k8s', 'BuildKit / buildx / kaniko', 'buildkit', 'Containers, K8s, Pods'),
    (3, 3, '3-containers-k8s', 'Kubernetes: Pod, Deployment, Service, Ingress', 'k8s', 'Containers, K8s, Pods'),
    (3, 4, '3-containers-k8s', 'Helm vs Kustomize', 'helm', 'Containers, K8s, Pods'),
    (3, 5, '3-containers-k8s', 'Pod-security: Kyverno / Gatekeeper', 'policy', 'Containers, K8s, Pods'),
    # Module 4
    (4, 1, '4-devsecops-core', 'SAST: SonarQube / SonarCloud', 'SAST', 'DevSecOps Core'),
    (4, 2, '4-devsecops-core', 'SAST альтернативы: Semgrep, CodeQL', 'semgrep', 'DevSecOps Core'),
    (4, 3, '4-devsecops-core', 'SCA: Dependabot, Renovate, OWASP DC', 'SCA', 'DevSecOps Core'),
    (4, 4, '4-devsecops-core', 'Контейнерное сканирование: Trivy, Grype', 'trivy', 'DevSecOps Core'),
    (4, 5, '4-devsecops-core', 'Secret-scanning: gitleaks, trufflehog', 'secrets', 'DevSecOps Core'),
    (4, 6, '4-devsecops-core', 'Supply chain: SLSA, cosign, in-toto, Scorecard', 'SLSA', 'DevSecOps Core'),
    # Module 5
    (5, 1, '5-secrets-auth', 'Надёжное хранение секретов', 'vault', 'Secrets, OAuth, 2FA'),
    (5, 2, '5-secrets-auth', 'OAuth 2.0 / OIDC до конца', 'OIDC', 'Secrets, OAuth, 2FA'),
    (5, 3, '5-secrets-auth', '2FA/MFA: TOTP, WebAuthn, push', 'webauthn', 'Secrets, OAuth, 2FA'),
    (5, 4, '5-secrets-auth', 'Ключи: SSH, GPG, age, signed commits', 'keys', 'Secrets, OAuth, 2FA'),
    (5, 5, '5-secrets-auth', 'Требования к ключам и 2FA: NIST 800-63B', 'NIST', 'Secrets, OAuth, 2FA'),
    # Module 6
    (6, 1, '6-observability', 'Prometheus: модель данных, PromQL', 'prometheus', 'Observability'),
    (6, 2, '6-observability', 'Grafana: дашборды как код', 'grafana', 'Observability'),
    (6, 3, '6-observability', 'InfluxDB v2 + Telegraf', 'influx', 'Observability'),
    (6, 4, '6-observability', 'Логи и трейсы: Loki, Tempo, OpenTelemetry', 'OTel', 'Observability'),
    (6, 5, '6-observability', 'SLO/SLI и error-budget alerts', 'SLO', 'Observability'),
    # Module 7
    (7, 1, '7-notifications', 'Telegram Bot API: пайплайн → чат', 'telegram', 'Notifications & ChatOps'),
    (7, 2, '7-notifications', 'Slack: incoming webhook vs Slack App', 'slack', 'Notifications & ChatOps'),
    (7, 3, '7-notifications', 'Discord webhooks / embeds + Bot', 'discord', 'Notifications & ChatOps'),
    (7, 4, '7-notifications', 'Alertmanager как маршрутизатор', 'alertmanager', 'Notifications & ChatOps'),
    # Module 8
    (8, 1, '8-cloud-practices', 'AWS: IAM, OIDC, ECR/ECS/EKS', 'AWS', 'Cloud Practices'),
    (8, 2, '8-cloud-practices', 'Azure: Entra ID, AKS, Key Vault', 'azure', 'Cloud Practices'),
    (8, 3, '8-cloud-practices', 'GCP: Workload Identity, GKE, Secret Manager', 'GCP', 'Cloud Practices'),
    (8, 4, '8-cloud-practices', 'IaC: Terraform / OpenTofu + Pulumi + Crossplane', 'IaC', 'Cloud Practices'),
    (8, 5, '8-cloud-practices', 'FinOps в CI/CD', 'FinOps', 'Cloud Practices'),
    (8, 6, '8-cloud-practices', 'Multi-cloud DR', 'DR', 'Cloud Practices'),
    # Module 9
    (9, 1, '9-depin', 'DePIN: модель и экономика', 'DePIN', 'DePIN & Decentralized Infrastructure'),
    (9, 2, '9-depin', 'Деплой в Akash + хранение артефактов на IPFS', 'akash', 'DePIN & Decentralized Infrastructure'),
    (9, 3, '9-depin', 'Гибрид: GH Actions → Akash, fallback на AWS', 'hybrid', 'DePIN & Decentralized Infrastructure'),
    # Module 10
    (10, 1, '10-edge-vps-vpn-mail', 'VPS hardening', 'hardening', 'Edge: VPS, VPN, Landing, Mail'),
    (10, 2, '10-edge-vps-vpn-mail', 'VPN: WireGuard, Tailscale, OpenVPN', 'VPN', 'Edge: VPS, VPN, Landing, Mail'),
    (10, 3, '10-edge-vps-vpn-mail', 'Landing page CD', 'CD', 'Edge: VPS, VPN, Landing, Mail'),
    (10, 4, '10-edge-vps-vpn-mail', 'Mail-сервер', 'mail', 'Edge: VPS, VPN, Landing, Mail'),
    # Module 11
    (11, 1, '11-data-backup', 'DB в CI/CD', 'migrations', 'Data: DB, Replication, Backup'),
    (11, 2, '11-data-backup', 'Репликация', 'replication', 'Data: DB, Replication, Backup'),
    (11, 3, '11-data-backup', 'Бэкапы: 3-2-1-1-0', 'backup', 'Data: DB, Replication, Backup'),
    (11, 4, '11-data-backup', 'DR-тренировки', 'chaos', 'Data: DB, Replication, Backup'),
    # Module 12
    (12, 1, '12-mistakes-and-capstone', 'Топ-30 типичных ошибок', 'mistakes', 'Mistakes, Best Practices & Capstone'),
    (12, 2, '12-mistakes-and-capstone', 'Pipeline hardening', 'hardening', 'Mistakes, Best Practices & Capstone'),
    (12, 3, '12-mistakes-and-capstone', 'Чек-листы перед prod', 'checklist', 'Mistakes, Best Practices & Capstone'),
    (12, 4, '12-mistakes-and-capstone', 'Capstone', 'capstone', 'Mistakes, Best Practices & Capstone'),
]

# Build sequential index: (mod, lesson) -> sequential number (1-based)
SEQ = {}
for i, (mod, lesson, *_) in enumerate(LESSONS):
    SEQ[(mod, lesson)] = i + 1


def parse_lesson_sections(readme_path, module_num):
    """Parse a module README and return dict of lesson_num -> content lines."""
    with open(readme_path, encoding='utf-8') as f:
        lines = f.readlines()

    sections = {}
    current_lesson = None
    current_lines = []

    # Pattern: ## 1.1 · title  or  ## 0.1 · title  etc.
    header_pat = re.compile(rf'^## {module_num}\.(\d+)\s*[·•]\s*', re.MULTILINE)

    for line in lines:
        m = re.match(rf'^#{{2,3}}\s+{module_num}\.(\d+)\s*[·•·]', line)
        if m:
            if current_lesson is not None:
                sections[current_lesson] = current_lines
            current_lesson = int(m.group(1))
            # Keep the header line (will be converted to h2)
            current_lines = [line]
        else:
            if current_lesson is not None:
                current_lines.append(line)

    if current_lesson is not None:
        sections[current_lesson] = current_lines

    return sections


def md_to_html(lines):
    """Convert markdown lines to HTML. Basic but handles most course content."""
    text = ''.join(lines)

    # Protect fenced code blocks
    code_blocks = []
    def save_code(m):
        lang = m.group(1) or ''
        code = m.group(2)
        # Escape HTML entities inside code
        code = code.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        html = f'<pre class="code-block"><code class="language-{lang}">{code}</code></pre>'
        idx = len(code_blocks)
        code_blocks.append(html)
        return f'\x00CODE{idx}\x00'

    text = re.sub(r'```([a-zA-Z0-9_.-]*)\n(.*?)```', save_code, text, flags=re.DOTALL)

    # Protect inline code
    inline_codes = []
    def save_inline(m):
        code = m.group(1).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        idx = len(inline_codes)
        inline_codes.append(f'<code>{code}</code>')
        return f'\x01IC{idx}\x01'
    text = re.sub(r'`([^`\n]+)`', save_inline, text)

    # Process line by line for headers, lists, blockquotes, tables
    lines = text.split('\n')
    result = []
    i = 0
    in_ul = False
    in_ol = False
    in_blockquote = False
    in_table = False
    table_buf = []

    def close_list():
        nonlocal in_ul, in_ol
        if in_ul:
            result.append('</ul>')
            in_ul = False
        if in_ol:
            result.append('</ol>')
            in_ol = False

    def close_blockquote():
        nonlocal in_blockquote
        if in_blockquote:
            result.append('</blockquote>')
            in_blockquote = False

    def flush_table():
        nonlocal in_table, table_buf
        if not table_buf:
            return
        result.append('<div class="table-wrap"><table>')
        header = True
        for row in table_buf:
            cells = [c.strip() for c in row.strip('|').split('|')]
            # Skip separator rows (---)
            if all(re.match(r'^[-: ]+$', c) for c in cells if c.strip()):
                header = False
                result.append('<tbody>')
                continue
            tag = 'th' if header else 'td'
            result.append('<tr>' + ''.join(f'<{tag}>{inline_fmt(c)}</{tag}>' for c in cells) + '</tr>')
        result.append('</table></div>')
        table_buf = []
        in_table = False

    def inline_fmt(s):
        # Bold
        s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
        s = re.sub(r'__(.+?)__', r'<strong>\1</strong>', s)
        # Italic
        s = re.sub(r'\*(.+?)\*', r'<em>\1</em>', s)
        s = re.sub(r'_(.+?)_', r'<em>\1</em>', s)
        # Links
        s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
        # Restore inline codes
        s = re.sub(r'\x01IC(\d+)\x01', lambda m: inline_codes[int(m.group(1))], s)
        return s

    while i < len(lines):
        line = lines[i]

        # Table row detection
        if re.match(r'^\s*\|', line):
            close_list()
            close_blockquote()
            in_table = True
            table_buf.append(line)
            i += 1
            continue
        elif in_table:
            flush_table()

        # Headers
        h_match = re.match(r'^(#{1,6})\s+(.*)', line)
        if h_match:
            close_list()
            close_blockquote()
            level = len(h_match.group(1))
            content = inline_fmt(h_match.group(2).strip())
            # Remove lesson number prefix from h2 (e.g., "1.1 · title" -> "title")
            if level in (2, 3):
                content = re.sub(r'^\d+\.\d+\s*[·•·]\s*', '', content)
            if level in (2, 3) and not result:
                # Skip the first section header — it's the lesson title, already in <h1>
                i += 1
                continue
            result.append(f'<h{level}>{content}</h{level}>')
            i += 1
            continue

        # Blockquotes
        if line.startswith('>'):
            close_list()
            if not in_blockquote:
                result.append('<blockquote>')
                in_blockquote = True
            content = line[1:].strip()
            if content:
                result.append(f'<p>{inline_fmt(content)}</p>')
            i += 1
            continue
        elif in_blockquote and line.strip() == '':
            close_blockquote()
            i += 1
            continue
        elif in_blockquote:
            close_blockquote()

        # Unordered list
        ul_match = re.match(r'^(\s*)[-*]\s+(.*)', line)
        if ul_match:
            close_blockquote()
            if not in_ul:
                close_list()
                result.append('<ul>')
                in_ul = True
            content = inline_fmt(ul_match.group(2).strip())
            result.append(f'<li>{content}</li>')
            i += 1
            continue

        # Ordered list
        ol_match = re.match(r'^(\s*)\d+\.\s+(.*)', line)
        if ol_match:
            close_blockquote()
            if not in_ol:
                close_list()
                result.append('<ol>')
                in_ol = True
            content = inline_fmt(ol_match.group(2).strip())
            result.append(f'<li>{content}</li>')
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^---+\s*$', line) or re.match(r'^===+\s*$', line):
            close_list()
            close_blockquote()
            result.append('<hr>')
            i += 1
            continue

        # Empty line
        if line.strip() == '':
            close_list()
            close_blockquote()
            result.append('')
            i += 1
            continue

        # Code block placeholder — output directly, no <p> wrapper
        stripped = line.strip()
        if re.match(r'^\x00CODE\d+\x00$', stripped):
            close_list()
            close_blockquote()
            result.append(stripped)
            i += 1
            continue

        # Regular paragraph
        close_list()
        close_blockquote()
        result.append(f'<p>{inline_fmt(line.strip())}</p>')
        i += 1

    close_list()
    close_blockquote()
    flush_table()

    # Restore code blocks
    html = '\n'.join(result)
    html = re.sub(r'\x00CODE(\d+)\x00', lambda m: code_blocks[int(m.group(1))], html)

    # Clean up multiple empty lines
    html = re.sub(r'\n{3,}', '\n\n', html)
    return html


COURSE_CSS = """\
/* CI/CD DevSecOps Mastery — course styles */
:root {
  --accent: #22d3ee;     /* cyan — security */
  --accent-2: #0ea5e9;
  --shield: #f59e0b;     /* amber — warning/audit */
  --ok: #34d399;
  --err: #f87171;
}

.lesson-nav {
  display: flex;
  gap: 12px;
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--border, rgba(255,255,255,0.1));
  flex-wrap: wrap;
}

.lesson-nav a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 8px;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
  color: var(--accent);
  text-decoration: none;
  font-size: 0.875rem;
  transition: all 0.2s;
  background: rgba(34, 211, 238, 0.04);
}

.lesson-nav a:hover {
  background: rgba(34, 211, 238, 0.1);
  border-color: var(--accent);
}

.lesson-nav a.next {
  margin-left: auto;
}

blockquote {
  border-left: 3px solid var(--accent);
  margin: 1.5rem 0;
  padding: 12px 20px;
  background: rgba(34, 211, 238, 0.05);
  border-radius: 0 8px 8px 0;
}

blockquote p {
  margin: 0;
  color: var(--muted, #94a3b8);
  font-style: italic;
}

.table-wrap {
  overflow-x: auto;
  margin: 1.5rem 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

th, td {
  padding: 10px 14px;
  text-align: left;
  border: 1px solid var(--border, rgba(255,255,255,0.1));
}

th {
  background: rgba(34, 211, 238, 0.08);
  font-weight: 600;
  color: var(--accent);
}

tr:nth-child(even) td {
  background: rgba(255,255,255,0.02);
}

hr {
  border: none;
  border-top: 1px solid var(--border, rgba(255,255,255,0.1));
  margin: 2rem 0;
}

ul, ol {
  padding-left: 1.5rem;
  margin: 1rem 0;
  color: var(--muted, #94a3b8);
}

li {
  margin-bottom: 0.4rem;
}

li strong {
  color: var(--text, #f8fafc);
}

.checklist {
  list-style: none;
  padding: 0;
}

.checklist li::before {
  content: '□ ';
  color: var(--accent);
  font-weight: 600;
}
"""


def build_lesson_html(mod, lesson, title, badge, module_title, content_html, prev_link, next_link):
    lesson_id = f'{mod}.{lesson}'
    seq = SEQ[(mod, lesson)]
    prev_html = f'<a href="{prev_link}">← Предыдущий урок</a>' if prev_link else ''
    next_html = f'<a href="{next_link}" class="next">Следующий урок →</a>' if next_link else ''

    return f'''<!doctype html>
<html lang="ru" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lesson {lesson_id} · {title} — CI/CD DevSecOps Mastery</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&amp;family=JetBrains+Mono:wght@400;600&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../../../../css/academy.css" />
  <link rel="stylesheet" href="../../assets/course.css" />
</head>
<body>
  <div id="site-header"></div>

  <div class="container">
    <div class="crumbs">
      <a href="../../../../index.html">Academy</a>
      <span class="sep">/</span>
      <a href="../../index.html">CI/CD DevSecOps Mastery</a>
      <span class="sep">/</span>
      <span>Lesson {lesson_id} · {title}</span>
    </div>

    <p class="lesson-meta">Module {mod} — {module_title} · Lesson {lesson_id} · <span class="badge-mini">{badge}</span></p>
    <h1>{title}</h1>

{content_html}

    <div class="lesson-nav">
      {prev_html}
      {next_html}
    </div>
  </div>

  <div id="site-footer"></div>
  <script src="../../../../js/header.js"></script>
  <script src="../../../../js/i18n.js"></script>
</body>
</html>'''


def lesson_dir_name(mod, lesson):
    return f'{mod}-{lesson}'


def lesson_path(mod, lesson):
    """Return relative path from one lesson's index.html to another lesson's index.html."""
    return f'../{lesson_dir_name(mod, lesson)}/index.html'


def generate():
    # Create assets dir and course.css
    assets_dir = os.path.join(COURSE_DIR, 'assets')
    os.makedirs(assets_dir, exist_ok=True)
    with open(os.path.join(assets_dir, 'course.css'), 'w', encoding='utf-8') as f:
        f.write(COURSE_CSS)
    print('Created assets/course.css')

    # Parse all module READMEs
    module_sections = {}
    module_dirs = {
        0: '0-foundations',
        1: '1-cicd-foundations',
        2: '2-packaging',
        3: '3-containers-k8s',
        4: '4-devsecops-core',
        5: '5-secrets-auth',
        6: '6-observability',
        7: '7-notifications',
        8: '8-cloud-practices',
        9: '9-depin',
        10: '10-edge-vps-vpn-mail',
        11: '11-data-backup',
        12: '12-mistakes-and-capstone',
    }

    for mod_num, mod_dir in module_dirs.items():
        readme = os.path.join(COURSE_DIR, 'lessons', mod_dir, 'README.md')
        if os.path.exists(readme):
            module_sections[mod_num] = parse_lesson_sections(readme, mod_num)
        else:
            module_sections[mod_num] = {}
            print(f'  WARNING: README not found for module {mod_num}')

    # Generate lesson HTML files
    lessons_dir = os.path.join(COURSE_DIR, 'lessons')

    for idx, (mod, lesson, dir_key, title, badge, module_title) in enumerate(LESSONS):
        # Determine prev/next
        prev_link = None
        next_link = None
        if idx > 0:
            pm, pl = LESSONS[idx-1][0], LESSONS[idx-1][1]
            prev_link = f'../{lesson_dir_name(pm, pl)}/index.html'
        if idx < len(LESSONS) - 1:
            nm, nl = LESSONS[idx+1][0], LESSONS[idx+1][1]
            next_link = f'../{lesson_dir_name(nm, nl)}/index.html'

        # Get content for this lesson
        sections = module_sections.get(mod, {})
        content_lines = sections.get(lesson, [])

        if content_lines:
            content_html = md_to_html(content_lines)
        else:
            content_html = f'<p class="note">Материалы урока готовятся. Загляните в <a href="../../lessons/{dir_key}/README.md">README модуля</a>.</p>'

        # Create lesson directory
        lesson_dir = os.path.join(lessons_dir, lesson_dir_name(mod, lesson))
        os.makedirs(lesson_dir, exist_ok=True)

        html = build_lesson_html(mod, lesson, title, badge, module_title, content_html, prev_link, next_link)

        out_path = os.path.join(lesson_dir, 'index.html')
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f'  Written: lessons/{lesson_dir_name(mod, lesson)}/index.html — {title}')

    print(f'\nGenerated {len(LESSONS)} lesson HTML files.')


def generate_course_index():
    """Update the course index.html to show individual lesson cards."""

    # Group lessons by module
    from collections import defaultdict
    by_module = defaultdict(list)
    for entry in LESSONS:
        mod = entry[0]
        by_module[mod].append(entry)

    module_info = {
        0:  ('Module 0 — Foundations &amp; Mindset', 'Lessons 0.1–0.3 · prerequisites', 'mindset'),
        1:  ('Module 1 — CI/CD Foundations', 'Lessons 1.1–1.5', 'pipelines'),
        2:  ('Module 2 — Multi-platform Packaging', 'Lessons 2.1–2.6', 'deb · brew · iOS · Android'),
        3:  ('Module 3 — Containers, K8s, Pods', 'Lessons 3.1–3.5', 'k8s'),
        4:  ('Module 4 — DevSecOps Core', 'Lessons 4.1–4.6', 'sast · sca · sbom'),
        5:  ('Module 5 — Secrets, OAuth, 2FA', 'Lessons 5.1–5.5', 'vault · oidc · webauthn'),
        6:  ('Module 6 — Observability', 'Lessons 6.1–6.5', 'prometheus · grafana · influx'),
        7:  ('Module 7 — Notifications &amp; ChatOps', 'Lessons 7.1–7.4', 'tg · slack · discord'),
        8:  ('Module 8 — Cloud Practices', 'Lessons 8.1–8.6', 'aws · azure · gcp'),
        9:  ('Module 9 — DePIN &amp; Decentralized Infra', 'Lessons 9.1–9.3', 'akash · ipfs · filecoin'),
        10: ('Module 10 — Edge: VPS, VPN, Landing, Mail', 'Lessons 10.1–10.4', 'vps · wireguard · mailcow'),
        11: ('Module 11 — Data: DB, Replication, Backup', 'Lessons 11.1–11.4', 'db · pgbackrest · velero'),
        12: ('Module 12 — Mistakes, Best Practices &amp; Capstone', 'Lessons 12.1–12.4', 'capstone'),
    }

    modules_html = ''
    for mod_num in sorted(by_module.keys()):
        h2, meta, _ = module_info[mod_num]
        modules_html += f'''
    <div class="module-h">
      <h2>{h2}</h2>
      <span class="module-meta">{meta}</span>
    </div>
    <div class="card-grid">
'''
        for entry in by_module[mod_num]:
            mod, lesson, dir_key, title, badge, module_title = entry
            lesson_id = f'{mod}.{lesson}'
            href = f'./lessons/{lesson_dir_name(mod, lesson)}/index.html'
            modules_html += f'''      <a class="card" href="{href}">
        <div class="card-head"><span class="num">Lesson {lesson_id}</span><span class="badge-mini">{badge}</span></div>
        <h3>{title}</h3>
      </a>
'''
        modules_html += '    </div>\n'

    html = f'''<!doctype html>
<html lang="ru" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CI/CD DevSecOps Mastery 🛡️ — Daskibo Academy</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&amp;family=JetBrains+Mono:wght@400;600&amp;display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../../css/academy.css" />
  <link rel="stylesheet" href="./assets/course.css" />
</head>
<body>
  <div id="site-header"></div>

  <div class="container">
    <div class="crumbs">
      <a href="../../index.html">Academy</a>
      <span class="sep">/</span>
      <span>CI/CD DevSecOps Mastery 🛡️</span>
    </div>

    <p class="lesson-meta">Course · 13 modules · 60 lessons · 24 labs · 10 sandboxes · capstone</p>
    <h1>CI/CD DevSecOps Mastery 🛡️</h1>
    <p>
      Курс «<strong>CI/CD DevSecOps Mastery</strong>» — путь от первого
      <code>git push</code> до подписанного мульти-арх контейнера, который
      деплоится через ArgoCD на EKS <em>и</em> Akash, бэкапится WAL-G, а
      падение SLO одновременно прилетает в Telegram, Slack и Discord.
      Каждый урок открыт <strong>песочницей</strong>: <code>act + k3d + Gitea +
      Vault + LocalStack</code> — без облака и без оплаты.
    </p>

    <div class="note">
      <strong>Sandbox-first.</strong> Любая команда сначала запускается локально:
      GH Actions через <code>act</code>, k8s через <code>k3d</code>, AWS через
      <code>LocalStack</code>, Vault через <code>vault server -dev</code>, Sigstore
      через self-hosted <code>Rekor + Fulcio</code>. Боевой облак — опционален.
    </div>

    <div class="note cyan">
      <strong>Канон-источники.</strong> Курс выстроен по OWASP DSOMM/SAMM,
      NIST SSDF (SP 800-218), SLSA v1.0, CIS Benchmarks, Google SRE и FinOps
      Foundation. Полный список — в <a href="./plan.md">plan.md</a>.
    </div>
{modules_html}
    <div class="module-h">
      <h2>Labs &amp; Sandboxes</h2>
      <span class="module-meta">24 labs + capstone · 10 sandboxes</span>
    </div>
    <div class="card-grid">
      <a class="card" href="./labs/README.md">
        <div class="card-head"><span class="num">Labs</span><span class="badge-mini">hands-on</span></div>
        <h3>Полный список лаб</h3>
        <p>STRIDE, hello-pipeline, .deb, brew, TestFlight, AAB, distroless, k3d, SonarQube, Renovate, Trivy, cosign, Vault, WebAuthn, Prometheus, InfluxDB, TG/Slack/Discord, Akash, mailcow, WAL-G, capstone.</p>
      </a>
      <a class="card" href="./sandboxes/README.md">
        <div class="card-head"><span class="num">Sandboxes</span><span class="badge-mini">docker-compose</span></div>
        <h3>10 изолированных стендов</h3>
        <p>pipeline, secrets, observability, k8s, cloud-lite, supply-chain, mail, vpn, depin, chaos.</p>
      </a>
    </div>

    <div class="note">
      <strong>Сертификация.</strong> 22/24 лаб с зелёным CI + capstone +
      OWASP DSOMM ≥ Level 2 во всех 4 dimensions. Подробнее — в
      <a href="./plan.md">plan.md</a>, секция 6.
    </div>
  </div>

  <div id="site-footer"></div>
  <script src="../../js/header.js"></script>
  <script src="../../js/i18n.js"></script>
</body>
</html>'''

    out_path = os.path.join(COURSE_DIR, 'index.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'Updated: {out_path}')


if __name__ == '__main__':
    generate()
    generate_course_index()
    print('\nDone.')
