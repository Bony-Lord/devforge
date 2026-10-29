# Privileged extension API 0.1.2 (alpha)

A `.studio-addon` remains JSON. Declarative contributions require their existing
capabilities. A top-level `module` string additionally requires the explicit
`extensions.full-access` capability. The manifest must require API 0.1.2 or later.
Third-party installation must be accepted in the review; executable code is never
loaded from a project merely by opening it. Built-in optional packages use the
same module loader and activation/disposal lifecycle.

```json
{
  "format": "cppstudio.addon", "formatVersion": 1,
  "manifest": {
    "schemaVersion": 1, "id": "example.tools", "version": "1.0.0",
    "api": {"min": "0.1.2", "maxExclusive": "0.2.0"},
    "name": "My tools", "license": "MIT",
    "capabilities": ["extensions.full-access"],
    "dependencies": {}, "conflicts": {}
  },
  "contributions": [],
  "module": "api.commands.register('hello', 'Hello', () => api.ui.toast('Hello'));"
}
```

The module is an activation function body receiving `api`; it may return a
disposer or a promise of one. Register cleanup with `api.use(disposable)` or
`api.subscriptions.push(...)`. `api.signal` aborts when the extension is retired.
Raw APIs and language registrations require the author to register their cleanup.

| API | Purpose |
| --- | --- |
| `commands.register(id, label, callback, key?)` | Command palette and keymap entry |
| `commands.execute(id, ...args)` | Execute an extension command |
| `views.register(id, title, render)` | Normal editor document tab; returns `open()` |
| `workspace.root / files / open / refresh / save` | Current project and documents |
| `workspace.configurations / actions` | Project-specific execution controls |
| `editor.active / document / models / action / onChange` | Source editor access |
| `editor.decorate(model, markers)` | Namespaced diagnostic markers with cleanup |
| `languages` | Monaco language/provider registration APIs |
| `configuration.get / set / onChange` | Namespaced persisted extension settings and change notifications |
| `host.request(operation, data) / on(event, callback)` | Validated native host protocol |
| `ui.element / toast / popover / style` | UI elements, anchored forms and styles |
| `events.listen` | Automatically disposed DOM listener |
| `hook(object, method, wrap)` | Layered behavior hook, removable in any order |
| `raw.application / editor / windows / document / monaco` | Full privileged IDE access |

This API grants full IDE privileges after review. It is not an isolation boundary,
and the module can also access browser globals. Host operations still validate
paths, workspace trust and process parameters. Modules can request folder trust
through the same IDE interface, so only install code you trust. There is no native
shared-library/DEX loader or full Node/VS Code API host in this alpha.

The official Vim and Function map modules in `ui/addons/catalog.json` are working
examples. Disabling/uninstalling removes registered commands, views and tracked
resources; extensions must not retain untracked global changes.

## Settings and dependency libraries

`manifest.configuration` declares the extension's settings (boolean, number,
string, enum, or JSON object/array). Its editor is available from the extension
card and the IDE settings; values are stored by extension ID. Use
`configuration.onChange` to apply changes to a running extension.

Library addons use the same versioned dependency graph and lifecycle as other
addons. `studio.lib.vim` is a working example: Vim depends on it, and its pinned
implementation is downloaded separately. Declare library requirements in
`manifest.dependencies`, using the existing version ranges. A library is not an
implicit unrestricted native loader.

Disabling or uninstalling reviews both requirements and reverse dependencies.
Users may cancel, disable dependents, and optionally clean unused requirements.
Requirements still used by other enabled extensions are retained, including
transitive libraries. Bulk component changes also review the affected graph.
Uninstalling a particular inactive version leaves the active version enabled.

`studio.vsix` owns the optional Open VSX/VSIX interface. Registry operations and
VSIX import require that addon; snippets and JSON theme colors remain the current
compatibility boundary, rather than a complete VS Code extension host.
