# Optional Python style tools

DevForge 0.6.0-dev.2 adds separate formatting and diagnostics addons for Python
files and code cells in notebooks. This is a local development build.

- **Python quality** combines the existing Python project pack with PEP 8 tools.
- **Notebook quality** adds the same tools to the notebook pack.
- Formatting and diagnostics can be enabled independently. Existing Python
  projects keep their current addon selection; upgrading does not download tools.

The component manager and first-launch selector show the optional runtime and its
download size. Applying a selection downloads three pinned pure-Python wheels
(92,155 bytes total), verifies their SHA-256 hashes, and loads them from a private
cache. This does not run pip or change the selected interpreter's installed
packages. Removing the runtime deletes only these cached wheels. It does not
delete Python, project files, or project settings. Python 3.10 or later is required.
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
300 diagnostics. Source is parsed, not executed, during analysis and formatting;
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
