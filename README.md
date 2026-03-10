# 🌌 Antigravity Laboratory

[![Project Status: Active](https://img.shields.io/badge/Project-Active-success?style=for-the-badge)](https://github.com/goodmai/antigravity)
[![Antigravity](https://img.shields.io/badge/Agent-Antigravity-blueviolet?style=for-the-badge&logo=antigravity)](https://goodmai.github.io/antigravity/)
[![QA Certified](https://img.shields.io/badge/QA-Certified-brightgreen?style=for-the-badge&logo=checkmarx)](https://goodmai.github.io/antigravity/)
[![Powered by Gemini](https://img.shields.io/badge/AI-Gemini-blue?style=for-the-badge&logo=google-gemini)](https://ai.google.dev/)
[![Qwen Enhanced](https://img.shields.io/badge/AI-Qwen-orange?style=for-the-badge)](https://github.com/QwenLM/Qwen)
[![Skill System](https://img.shields.io/badge/System-SKILL-red?style=for-the-badge)](./skills/)

[![Deploy status](https://github.com/goodmai/antigravity/actions/workflows/static.yml/badge.svg)](https://github.com/goodmai/antigravity/actions/workflows/static.yml)

**English** | **[Русский](#русский)**

> Explore the future of agentic coding and autonomous development. This laboratory contains structured lessons and practical labs to master the Antigravity agent ecosystem.

---

## 📑 Table of Contents

1.  [Prerequisites](#-prerequisites)
2.  [Installation](#-installation)
3.  [Curriculum (Lessons)](#-curriculum-lessons)
4.  [Laboratory & Capstone](#-laboratory--capstone)
5.  [Local Agent Control](#-local-agent-control)
6.  [Contributing](#-contributing)

---

## 🛠 Prerequisites

Before starting, ensure you have the following installed:

- **Python 3.10+**: Core engine for scripts and conversion tools.
- **Node.js & npm**: Required for advanced web-integrated skills.
- **Git**: For version control and deployment.
- **Pandoc**: Essential for the Markdown-to-HTML lesson pipeline.

---

## ⚙️ Installation

To set up your local laboratory:

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/goodmai/antigravity.git
    cd antigravity
    ```

2.  **Install dependencies** (Optional: use a virtual environment):

    ```bash
    python3 -m venv .venv
    source .venv/bin/activate
    # Install specific skill requirements if needed
    ```

3.  **Explore the Academy**:
    - Visit the **[Online Academy](https://goodmai.github.io/antigravity/)** for an interactive experience.
    - Or navigate to the `lessons/` directory locally.

---

## 🎓 Curriculum (Lessons)

Each lesson is available as a high-quality interactive HTML page and a local Markdown file.

| ID  | Title                  | Links                                                                                 |
| :-- | :--------------------- | :------------------------------------------------------------------------------------ |
| 01  | Agent Modes            | [Web](https://goodmai.github.io/antigravity/lessons/1/) / [MD](./lessons/1/README.md) |
| 02  | Feedback & Artifacts   | [Web](https://goodmai.github.io/antigravity/lessons/2/)                               |
| 03  | Mentions & Workflows   | [Web](https://goodmai.github.io/antigravity/lessons/3/)                               |
| 04  | Agent Skills           | [Web](https://goodmai.github.io/antigravity/lessons/4/)                               |
| 05  | Standard Skills        | [Web](https://goodmai.github.io/antigravity/lessons/5/)                               |
| 08  | Task Groups            | [Web](https://goodmai.github.io/antigravity/lessons/8/)                               |
| 09  | Browser Subagent       | [Web](https://goodmai.github.io/antigravity/lessons/9/)                               |
| 10  | MCP & Integration      | [Web](https://goodmai.github.io/antigravity/lessons/10/)                              |
| 11  | Terminal & Security    | [Web](https://goodmai.github.io/antigravity/lessons/11/)                              |
| 12  | Playwright Autotests   | [Web](https://goodmai.github.io/antigravity/lessons/12/)                              |
| 13  | Cloud & Firebase       | [Web](https://goodmai.github.io/antigravity/lessons/13/)                              |
| 14  | Docker & Microservices | [Web](https://goodmai.github.io/antigravity/lessons/14/)                              |
| 15  | CI/CD Pipelines        | [Web](https://goodmai.github.io/antigravity/lessons/15/)                              |
| 16  | Mobile Dev             | [Web](https://goodmai.github.io/antigravity/lessons/16/)                              |
| 17  | Modern Web (Next.js)   | [Web](https://goodmai.github.io/antigravity/lessons/17/)                              |
| 18  | Refactoring & AI       | [Web](https://goodmai.github.io/antigravity/lessons/18/)                              |
| 19  | Microservices SDLC     | [Web](https://goodmai.github.io/antigravity/lessons/19/)                              |

---

## 🧪 Laboratory & Capstone

Practical application of Antigravity power.

- **[Lab 01: TeleDrive Ecosystem](https://goodmai.github.io/antigravity/labs/01/)**: Full-stack integration of Telegram, Obsidian, and Google Drive.

---

## 🎮 Local Agent Control

Local management is handled through **Workflows** located in `.agent/workflows/`. These provide out-of-the-box automation for complex tasks.

### Key Workflows:

- **`qa-suite`**: Full automated QA cycle using the `qa-skill-tester`.
- **`securcheck`**: Senior-level security audit and code quality review.
- **`artifact-archival`**: Standardized archival with timestamps.

**Run a workflow**:

```bash
# Example
run_workflow securcheck
```

---

## <a name="русский"></a> ℹ️ Информация на русском

Этот репозиторий является учебной базой для освоения автономных агентов. Здесь собраны лучшие практики промпт-инжиниринга, архитектурные паттерны и готовые инструменты (Skills) для ускорения разработки.

---

## 🤝 Contributing

Contributions are welcome! If you have a new **Skill** or **Workflow**, please submit a Pull Request.
