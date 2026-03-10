# Antigravity JAR Skill (Stateless CLI Edition)

<p align="center">
  <img src="https://projects.eclipse.org/themes/custom/solstice/images/logos/eclipse-foundation-grey-orange.svg" width="300" alt="Eclipse Foundation Logo">
</p>

[🏠 Main Repository](https://github.com/goodmai/jss)

**Antigravity JAR Skill** is a high-performance console utility for deep semantic analysis of Java JAR archives. Unlike traditional LSP servers, this skill operates in **Stateless CLI** mode, making it ideal for AI agents: no background processes, instant memory release, and predictability.

## 🚀 Key Features

- **jar.analyzeContext**: Fast reconnaissance of JAR structure (manifest, package, and class lists).
- **jar.getClassInfo**: Detailed introspection of a specific class (fields, methods, access modifiers).
- **jar.deepScan**: Full package scanning to understand relationships.
- **jar.getImplementors**: Find all classes implementing a target interface or extending a class.
- **jar.getReferences**: Find all call sites of a method within the JAR ("Find Usages").
- **scala.analyzeContext**: Analysis of Scala-specific context (version, TASTy files, libraries).
- **scala.getClassInfo**: Introspection of Scala classes with support for ScalaSignature and TASTy metadata.
- **scala.deepScan**: Deep scanning of Scala packages.

---

## 🛠 Usage for Debugging (CLI Calls)

### 1. Console Invocation (via `java -jar`)

You can use the utility directly from the terminal. It takes a command as the first argument, followed by parameters. The result is always output in JSON format.

**Package Scouting Example:**

```bash
java -cp bin/ultimate-jar-lsp-1.0.0-all.jar com.example.UltimateJarLanguageServer jar.analyzeContext /absolute/path/to/target.jar com.example.dto
```

**Scala Context Analysis Example:**

```bash
java -cp bin/ultimate-jar-lsp-1.0.0-all.jar com.example.ScalaJarLanguageServer scala.analyzeContext /absolute/path/to/scala-project.jar
```

**Class Info Retrieval Example:**

```bash
java -jar bin/ultimate-jar-lsp-1.0.0-all.jar jar.getClassInfo /absolute/path/to/target.jar com.example.dto.LoggerDto true true
```

### 2. Usage in AI Agent Chats

Agents invoke this skill through the standard bash command execution mechanism.

**Prompt Example:**

> "Analyze the class `com.example.service.AuthService` in the file `lib/auth.jar` using the console utility `jar.getClassInfo` and show the signatures of public methods."

---

## 🔗 Instructions for Connecting to Gemini-CLI

To integrate the skill into your `gemini-cli` environment, follow these steps:

1. **Add to Configuration**:
   Open your `gemini.yaml` configuration file and add the path to the skill. Specify that this skill operates via console invocation:

   ```yaml
   skills:
     - name: jar-skill
       path: /home/g/jss/skills/antigravity-jar-skill
       alias: -jss
       execution_mode: cli
   ```

2. **Build and Preparation**:
   Ensure the binary file is built:

   ```bash
   mvn clean package -DskipTests
   cp target/ultimate-jar-lsp-1.0.0-all.jar skills/antigravity-jar-skill/bin/
   ```

3. **Verification**:
   Check the functionality with a simple command:
   ```bash
   java -jar skills/antigravity-jar-skill/bin/ultimate-jar-lsp-1.0.0-all.jar jar.analyzeContext some.jar
   ```

---

## 💎 Why CLI Mode is Better?

- **Stateless**: No hung sessions or port issues.
- **Predictable**: The agent receives a clean JSON result of the command execution.
- **Efficient**: We use ZGC and memory limits (`-Xmx512m`) for each call, ensuring the security of the host system.
