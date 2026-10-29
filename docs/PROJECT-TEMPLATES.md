# Project templates and attachments

DevForge 0.6.0-dev.1 adds declarative templates, shared by Android and desktop.
This is a local development build. Templates do not contain executable plugin
code; providers such as CMake, Python, clangd and clang-format remain addons/tools.

## Using templates

* **New project** opens an anchored form. Select a template, fill its parameters,
  optionally select compatible attachments, then **Preview → Create**.
* **Create… → Attach project template…** adds a recipe to the current project.
  The command palette also exposes attachment and template-library commands.
* **My templates…** opens the JSON library. Duplicate a built-in, give it your own
  ID, edit, and **Save custom**. Import `.studio-template` files or export a
  `.studio-addon` containing the template. Importing only opens the editor;
  applying a template is a separate action.

The catalog contains 5 project templates (CMake C++, CMake C, Python application,
Python notebook, empty/manual) and 8 attachments (clangd, C++ Studio formatting,
GCC, Clang, Python interpreter, PEP 8 settings, EditorConfig, CMake test scaffold).
There are no duplicate “C/C++ file” project choices. Source-file creation remains
in the file menu. New installations start with no sample project.

Each new compiled project has **one Main configuration** and separate Debug and
Release profiles. Existing user configurations are retained. Python templates
only declare Run, so the build button and build-console selector are hidden.
They do not enable CMake, clangd or clang-format.

## Format

See [a complete Python example](../examples/templates/python-tool.studio-template)
and [the addon wrapper](../examples/templates/python-tool.studio-addon).

```json
{
  "format": "devforge.template",
  "version": 1,
  "id": "my.templates.editor-settings",
  "kind": "attachment",
  "name": {"ru": "Мои отступы", "en": "My indentation"},
  "parameters": [
    {"id": "width", "label": "Indent width", "type": "choice",
     "choices": ["2", "4", "8"], "default": "4"}
  ],
  "appliesTo": ["*"],
  "requires": {"addons": [], "tools": []},
  "files": [
    {"path": ".editorconfig",
     "text": "root = true\n\n[*]\nindent_style = space\nindent_size = {{width}}\n"}
  ]
}
```

* `kind` is `project` or `attachment`. IDs have lowercase dot-separated segments.
* `parameters` supports `text`, `identifier`, `relativePath` and `choice`.
  `projectName` is provided by the host. `{{name}}` inserts a literal string;
  `{{name|json}}` inserts a quoted JSON/Python string. There is no JavaScript,
  shell substitution, HTML or template evaluation.
* `files` contains relative paths and UTF-8 text. Traversal, absolute paths,
  Windows device names, case-colliding files and reserved IDE directories are
  rejected. File generation is limited to 128 files and 1 MiB expanded data.
* `entryFile` selects a generated file to open.
* `requires.addons` references addon IDs; `requires.tools` references tool IDs
  such as `gcc`, `clang`, `cmake`, `analysis` or `python`. The form lists these
  tools and offers to install missing ones. On desktop, missing system programs
  still need the OS package manager / configured executable paths.
* `appliesTo` limits attachments to project types, or `*` for all types.
* A project template declares `project.projectType`, `profiles`, `configurations`
  and `active`, using the normal `.devforge/project.json` schema. Arbitrary custom
  type names are supported. Profiles/actions/interface/addons can specialize a
  project. An empty/manual project has no default commands.
* An attachment can merge `project.tooling` metadata and patch the **active**
  profile through `profile` (`compiler`, standards, flags, CMake options,
  `pythonExecutable`, environment). Other profiles and user run commands survive.
  Tooling metadata documents the binding; it does not implement a new provider.
  Referenced providers must already exist as addons. A custom type alone does
  not install language support or create a new compiler backend.

Compilers/interpreters are reusable runtime providers. Templates configure them
and declare dependencies instead of embedding binaries. The PEP 8 attachment is
configuration for the optional autopep8/pycodestyle addons; accepting the recipe's
requirements downloads their verified wheels separately. See [Python tools](PYTHON-TOOLS.md). CMake tests are created under
`tests/`; add `add_subdirectory(tests)` explicitly to your root CMakeLists.txt.

## Review and concurrency

The preview shows generated files, project metadata and collisions. Existing
identical files stay unchanged. A conflicting file needs an explicit replacement
choice. Batches compare raw SHA-256 snapshots immediately before writing and
reject a stale project, file or dirty editor. Project switches/typing during a
tool download invalidate the preview.

Both hosts preflight the complete batch and roll back their own writes if a
write fails. Replacements retain original contents (desktop local history;
Android `.forge/templates/<transaction>/…` raw-byte copies). This is a bounded
batch with rollback, not an atomic filesystem transaction across power loss.
Templates only write files and configuration. Normal trusted-project analysis
can subsequently invoke the project's selected tools; Build/Run are separate.

User templates are stored locally in IDE settings; templates in addons use the
`projectTemplates` extension point and explicit `projects.templates` capability.
Addon template IDs must start with the owning addon ID plus `.`. Disabling the
addon removes its catalog contributions, while generated project files remain.
This extends the data-addon format; arbitrary executable third-party mods remain
a separate, unfinished SDK task.

## Other changes in this local build

Notebook code accepts `!command`, `output = !command`, `%pwd`, `%cd`, `%ls`,
`%env`, `%pip`, `%run`, `%time`, `%sx`, `%system`, plus `%%sh`, `%%bash`,
`%%cmd`, `%%time`, `%%writefile` and `%%capture`. This is a small local adapter,
not full IPython/Colab compatibility. Python literals, comments and multiline
modulo expressions stay Python. Shell output is streamed and bounded. Commands
run with the selected trusted kernel, and normal notebook stop/restart owns the
process lifetime. The physical Android shell/magic path has not been retested
in this build.

The Windows installer omits unused Chromium translations (English/Russian
retained), uses maximum compression, and includes no system compiler/Python.
The same translation pruning supports Linux/macOS package layouts, including
`.lproj`; native installer size and GUI behavior there have not been verified
on this Windows machine. General executable-addon SDK, real downloadable UI
modules, Python type analysis/debugging, and further document viewers remain work
in progress. This build does not claim a completed universal mod marketplace.
