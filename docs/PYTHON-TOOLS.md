# Optional Python tools and interpreter selection

DevForge 0.6.0-dev.3 provides separate completion, formatting and diagnostics
addons for Python files and notebook code cells. This is a local development build.

- **Python quality** combines the Python project pack with Jedi and PEP 8 tools.
- **Notebook quality** adds the same tools to the notebook pack.
- Formatting and diagnostics can be enabled independently. Existing Python
  projects keep their current addon selection; upgrading does not add quality tools.

Jedi 0.20.1 and parso 0.8.7 download separately (4,993,005 bytes combined).
Their pinned wheels are verified and extracted into a bounded private cache;
extraction completes during installation, before the first completion.
The persistent worker supplies completions, documentation and parameter help,
using the selected interpreter's installed packages. Notebook analysis includes
preceding code cells without executing them. Ctrl+Alt+Space requests completions;
Ctrl+Alt+P requests parameter help. Both shortcuts remain configurable.

On desktop, the notebook toolbar displays the actual Python version. Its interpreter chooser
and the Python status menu show executable paths. A run profile's
explicit interpreter takes precedence over the global setting, a trusted local
`.venv`, and automatically found interpreters. Native Windows CPython is preferred
over MSYS2 for automatic selection. Project-level interpreter paths are ignored
when probing an untrusted workspace.

Both `%pip` and simple bare `!pip` / `!pip3` commands use the notebook kernel's
`sys.executable -m pip`. They invalidate import caches and refresh the intelligence
worker after successful installs or uninstalls. A failed pip command marks the
cell as failed. Compound shell expressions retain shell behavior. The kernel's
import path includes the working directory, so ordinary local modules work too.
Installing a package into another Python environment does not make it available
to the selected one; the version chip and executable path make this distinction
visible. Already imported packages may still require restarting the kernel.

The component manager and first-launch selector show the optional runtime and its
download size. Applying the style selection downloads three pinned pure-Python wheels
(92,155 bytes total), verifies their SHA-256 hashes, and loads them from a private
cache. This does not run pip or change the selected interpreter's installed
packages. Removing style tools deletes their cached wheels. Removing intelligence also
clears its extracted libraries and analysis index. Neither removes Python,
project files, or project settings. Python 3.10 or later is required.
On desktop the active run profile's interpreter is used; Android uses its optional
Python runtime. Network access is needed for the initial download or reinstall. The notebook
kernel runs with bytecode-cache writing disabled so it cannot add `.pyc` files
to installed application resources. Desktop packaging and installer preflight
reject caches, downloaded wheels, and signing keys in the core payload.

Use **Format** in the toolbar, a code cell's format button, `Ctrl+Alt+L`, or
`Shift+Alt+F`. Formatting preserves undo history and refuses to apply a late
response over newer edits. Syntax errors are shown without rewriting invalid
source. Shell commands and line magics in notebook cells are retained; cell-magic
bodies are left unchanged. This is the existing DevForge magic adapter, not a
complete IPython implementation.

The PEP 8 attachment template creates `.pep8`. The tools also read the
`[pycodestyle]` section of `setup.cfg`, `tox.ini`, `.pycodestyle`, and `.pep8`, plus
`[tool.autopep8]` / `[tool.devforge.python]` in `pyproject.toml`. The supported fields
are `max_line_length`, `indent_size`, `ignore`, and `select`. Configuration is read
only inside the project, with nearer folders overriding ancestors. Invalid or
oversized configuration reports an error. Formatting uses no aggressive fixes and
checks that the parsed Python syntax tree remains equivalent.

Diagnostics are debounced after edits and appear as underlines, notebook cell
messages, and entries in Problems. Per-cell requests have distinct identities;
older versions and results from a previous project cannot replace current
diagnostics. Visible notebook cells are checked automatically, with at most two
analysis requests running at once; queued obsolete requests are discarded. Processing is limited to 512 KiB of UTF-8 source per request and
300 diagnostics. Notebook cells do not receive the file-only missing-final-newline
warning W292; shell/magic placeholders do not create a false E402 import warning.
Source is parsed, not executed, during analysis and formatting;
tools are available only in trusted workspaces.

This provides syntax and PEP 8 checks. It does not provide Pyright-style type
analysis, unknown-name checks, unused-import checks, a Python debugger, or full
Jupyter compatibility. Native Python-tool execution on a physical Android device
and Linux/macOS GUI integration have not been verified for this build.

Versions, download hashes, and origins are in
`app/src/main/assets/python/style-manifest.json`. Packages keep their upstream
licenses inside the wheels; copies are in `licenses/autopep8-LICENSE`,
`licenses/pycodestyle-LICENSE`, and `licenses/tomli-LICENSE`.

Primary references: [autopep8](https://github.com/hhatto/autopep8),
[pycodestyle API](https://pycodestyle.pycqa.org/en/stable/developer.html),
[tomli](https://github.com/hukkin/tomli).
