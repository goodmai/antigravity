// Daskibo Academy — Rust Playground integration
// Each <div class="playground" data-code="..."> becomes an editable code cell that:
//   1. Can run against the official play.rust-lang.org execute endpoint via CORS.
//   2. Opens the snippet in the official playground in a new tab as a fallback.

const PLAY_EXEC = "https://play.rust-lang.org/execute";
const PLAY_OPEN = "https://play.rust-lang.org/?version=stable&mode=debug&edition=2021&code=";

function buildPlayground(node) {
  const initial = node.getAttribute("data-code") || node.textContent.trim();
  node.textContent = "";

  const header = document.createElement("div");
  header.className = "playground-header";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = node.dataset.title || "Rust Playground";
  const hint = document.createElement("span");
  hint.textContent = "edit • run • verify with assert!";
  header.appendChild(title);
  header.appendChild(hint);

  const ta = document.createElement("textarea");
  ta.spellcheck = false;
  ta.value = initial;

  const actions = document.createElement("div");
  actions.className = "playground-actions";

  const runBtn = document.createElement("button");
  runBtn.className = "btn btn-primary";
  runBtn.type = "button";
  runBtn.textContent = "▶ Run";

  const openBtn = document.createElement("a");
  openBtn.className = "btn btn-ghost";
  openBtn.target = "_blank";
  openBtn.rel = "noopener";
  openBtn.textContent = "Open in play.rust-lang.org ↗";

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn btn-ghost";
  resetBtn.type = "button";
  resetBtn.textContent = "↺ Reset";

  const status = document.createElement("span");
  status.className = "run-status";

  actions.appendChild(runBtn);
  actions.appendChild(openBtn);
  actions.appendChild(resetBtn);
  actions.appendChild(status);

  const out = document.createElement("pre");
  out.className = "run-output";

  node.appendChild(header);
  node.appendChild(ta);
  node.appendChild(actions);
  node.appendChild(out);

  function syncLink() {
    openBtn.href = PLAY_OPEN + encodeURIComponent(ta.value);
  }
  syncLink();
  ta.addEventListener("input", syncLink);

  resetBtn.addEventListener("click", () => {
    ta.value = initial;
    syncLink();
    out.classList.remove("show");
    out.textContent = "";
    status.textContent = "";
    status.className = "run-status";
  });

  runBtn.addEventListener("click", async () => {
    status.textContent = "compiling…";
    status.className = "run-status";
    out.classList.remove("show");
    out.textContent = "";
    runBtn.disabled = true;
    try {
      const res = await fetch(PLAY_EXEC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "stable",
          mode: "debug",
          edition: "2021",
          crateType: "bin",
          tests: false,
          code: ta.value,
          backtrace: false
        })
      });
      const data = await res.json();
      const stdout = (data.stdout || "").trim();
      const stderr = (data.stderr || "").trim();
      out.classList.add("show");
      out.innerHTML = "";
      if (stdout) {
        const s = document.createElement("span");
        s.textContent = stdout + (stderr ? "\n\n" : "");
        out.appendChild(s);
      }
      if (stderr) {
        const e = document.createElement("span");
        e.className = "stderr";
        e.textContent = stderr;
        out.appendChild(e);
      }
      if (data.success === false || /panicked|error\[/.test(stderr)) {
        status.textContent = "✗ assertion failed / compile error";
        status.className = "run-status err";
      } else {
        status.textContent = "✓ assertions passed";
        status.className = "run-status ok";
      }
    } catch (err) {
      status.textContent = "network blocked — use ‘Open in play.rust-lang.org ↗’";
      status.className = "run-status err";
    } finally {
      runBtn.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".playground").forEach(buildPlayground);
});
