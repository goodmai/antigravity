# SKILL: BINARY ARTIFACT ANALYSIS (JAR ANTIGRAVITY)

You have the ability to directly read metadata, structure, and API of compiled .jar archives using the console utility `ultimate-jar-lsp-1.0.0-all.jar`.
The utility returns clean JSON. Your goal is TOKEN CONSUMPTION MINIMIZATION. It is forbidden to scan archives entirely without filters.

## CONSOLE INVOCATION FORMAT (BASH)

Use the system command execution tool to call the JAR file. Base syntax:
`java -jar /path/to/skill/bin/ultimate-jar-lsp-1.0.0-all.jar <COMMAND> <ARGUMENTS...>`

### AVAILABLE COMMANDS (ENDPOINTS):

1. **Reconnaissance (jar.analyzeContext)** - Mandatory first step! Outputs the manifest and class list.
   - _Syntax:_ `java -jar ... jar.analyzeContext <absolute_path_to_jar> [package_filter_string]`
   - _Example:_ `java -jar bin/ultimate-jar-lsp-1.0.0-all.jar jar.analyzeContext /app/lib.jar com.google`

2. **Granular API Analysis (jar.getClassInfo)** - Provides method signatures and fields of a single class.
   - _Syntax:_ `java -jar ... jar.getClassInfo <path_to_jar> <class_FQN> <includePrivate: boolean> <includeAnnotations: boolean>`
   - _Example:_ `java -jar bin/ultimate-jar-lsp-1.0.0-all.jar jar.getClassInfo /app/lib.jar com.example.AuthService false true`

3. **Mass Dump (jar.deepScan)** - Use ONLY in case of absolute necessity for global search.
   - _Syntax:_ `java -cp ... com.example.UltimateJarLanguageServer jar.deepScan <path_to_jar> <package_filter_string> <includePrivate> <includeAnnotations>`
   - _Important:_ The package filter argument is strictly mandatory, otherwise the context will overflow!

4. **Find Implementors (jar.getImplementors)** - Finds all classes implementing an interface or extending a class.
   - _Syntax:_ `java -jar ... jar.getImplementors <path_to_jar> <target_interface_or_class_FQN>`
   - _Example:_ `java -jar bin/ultimate-jar-lsp-1.0.0-all.jar jar.getImplementors /app/lib.jar com.example.Repository`

5. **Find References (jar.getReferences)** - Finds all call sites of a method within the JAR ("Find Usages").
   - _Syntax:_ `java -jar ... jar.getReferences <path_to_jar> <target_owner_class_FQN> [method_name]`
   - _Example:_ `java -jar bin/ultimate-jar-lsp-1.0.0-all.jar jar.getReferences /app/lib.jar com.example.RestTemplate execute`

6. **Scala Context Analysis (scala.analyzeContext)** - Determining Scala version and TASTy files.
   - _Syntax:_ `java -cp ... com.example.ScalaJarLanguageServer scala.analyzeContext <path_to_jar>`

7. **Scala Introspection (scala.getClassInfo)** - Reading ScalaSignature and TASTy data.
   - _Syntax:_ `java -cp ... com.example.ScalaJarLanguageServer scala.getClassInfo <path_to_jar> <class_FQN> <includePrivate> <includeAnnotations>`

---

## WORKFLOW

### Scenario A: Debugging an Exception (Debug Stacktrace)

If you have a stacktrace with an error from a closed library:

1. Call `jar.analyzeContext`, specifying the JAR path and passing the package from the stacktrace as a filter.
2. Find the exact class name (FQN) in the returned JSON.
3. Call `jar.getClassInfo` for this class, setting `<includePrivate> = true`.
4. Examine the returned JSON with private/public method signatures and fields to understand the cause of the failure.

### Scenario B: Creating a New Class / Implementing an Interface

If you need to write a class that implements an interface from a JAR file:

1. Call `jar.getClassInfo` for this interface, setting `<includePrivate> = false` and `<includeAnnotations> = true`.
2. After receiving the JSON, study the `methods` array, their `descriptor` (parameter types), and `throws` (exceptions).
3. Generate Java code based on the obtained semantic contract.

### Scenario C: Understanding Usage Patterns

If you need to understand how an API is used inside a library:

1. Call `jar.getImplementors` to find all implementations of a target interface.
2. Call `jar.getReferences` to find all call sites of a specific method.
3. Analyze the caller classes and methods to understand hidden patterns and best practices.

---

## THE FEEDBACK LOOP (Code Writing Cycle)

You have no active IDE. You must act as a disciplined terminal developer. For writing and fixing code, use the following cycle:

1. **API Reconnaissance (Antigravity Skill):**
   If you need to use a dependency, call `java -jar ... jar.getClassInfo <jar> <class>`. You will get exact signatures and types.

2. **Usage Examples (Antigravity Skill):**
   If you don't know how to correctly call a method, find how other classes in the library do it:
   `java -jar ... jar.getReferences <jar> com.example.TargetClass methodName`
   Or find existing implementations of an interface:
   `java -jar ... jar.getImplementors <jar> com.example.TargetInterface`

3. **Mutation (Bash/File System):**
   Generate code and write it to a `.java` file in the project.

4. **Compilation Check (Bash - ERRORS):**
   Run the incremental compiler via console: `mvn clean compile` or `javac <file>.java`.
   If the compiler outputs an error (e.g., `cannot find symbol`), return to Step 1 and re-check the signature via `jar.getClassInfo`.

5. **Testing (Bash):**
   Run tests via `mvn test -Dtest=YourTestClass`.
