"""Static Jedi service for the selected Python environment. JSON lines, no cell execution."""
import contextlib
import io
import json
import os
import pathlib
import sys
from package_store import PackageStore

MANIFEST = json.loads(pathlib.Path(__file__).with_name("intelligence-manifest.json").read_text(encoding="utf-8"))
store = PackageStore(MANIFEST)
cache = pathlib.Path(sys.argv[2]).resolve()
environment_cache = None
projects_cache = {}


def query(request, jedi):
    global environment_cache
    text = request["text"]
    if not isinstance(text, str) or len(text.encode("utf-8")) > 524288:
        raise ValueError("Python source exceeds 512 KiB")
    root = pathlib.Path(request["root"]).resolve()
    file = pathlib.Path(request["path"]).resolve()
    if not file.is_relative_to(root):
        raise ValueError("Python source outside project")
    if request.get("notebook"):
        from notebook_magics import Magics
        text = Magics({}).transform(text)
        file = file.with_suffix(".notebook.py")
    line, column = int(request["line"]), int(request["column"])
    lines = text.split("\n")
    if not 1 <= line <= len(lines) or not 0 <= column <= len(lines[line - 1]):
        raise ValueError("Invalid Python cursor")
    # SameEnvironment retains the exact interpreter's installed site-packages.
    if environment_cache is None:
        environment_cache = jedi.create_environment(sys.executable, safe=False)
    environment = environment_cache
    key = (str(root), tuple(request.get("extraPaths", [])))
    if key not in projects_cache:
        if len(projects_cache) > 8:
            projects_cache.clear()
        projects_cache[key] = jedi.Project(str(root), environment_path=sys.executable, added_sys_path=list(key[1]), load_unsafe_extensions=False)
    project = projects_cache[key]
    script = jedi.Script(text, path=str(file), environment=environment, project=project)
    action = request["action"]
    if action == "complete":
        items = script.complete(line, column)
        return {"items": [{"label": item.name, "kind": item.type, "start": max(0, column - item.get_completion_prefix_length())} for item in items[:300]], "incomplete": len(items) > 300}
    if action == "hover":
        names = script.help(line, column)
        return {"contents": [{"title": name.description, "qualifiedName": name.full_name or name.name,
                              "kind": name.type, "text": name.docstring(raw=True)[:8000],
                              "signatures": [sig.to_string()[:2000] for sig in name.get_signatures()[:4]]}
                             for name in names[:2]]}
    if action == "signature":
        return {"signatures": [{"name": signature.name, "label": signature.to_string(), "documentation": signature.docstring(raw=True)[:1500], "parameters": [p.to_string() for p in signature.params], "activeParameter": signature.index or 0} for signature in script.get_signatures(line, column)[:4]]}
    raise ValueError("Unknown Python intelligence operation")


def main():
    action = sys.argv[1]
    if action in ("install", "serve") and sys.version_info < (3, 10):
        raise ValueError("Python 3.10 or newer is required for Jedi tools")
    if action == "install":
        status = store.install(cache)
        store.materialize(cache)
        print(json.dumps({"ok": True, **status}));return
    if action == "info":
        print(json.dumps({"ok": True, **store.info(cache)}));return
    if action != "serve":
        raise ValueError("Unknown intelligence command")
    sys.path[:0] = store.materialize(cache)
    import jedi
    jedi.settings.cache_directory = str(cache / "index")
    print(json.dumps({"type": "ready", "version": jedi.__version__, "executable": sys.executable}), flush=True)
    for raw in sys.stdin:
        request = {}
        try:
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError("Python intelligence request too large")
            request = json.loads(raw)
            with contextlib.redirect_stdout(io.StringIO()):
                result = query(request, jedi)
            print(json.dumps({"id": request["id"], "ok": True, **result}, ensure_ascii=True), flush=True)
        except Exception as error:
            print(json.dumps({"id": request.get("id"), "ok": False, "error": str(error)[:2000]}, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)[:2000]}), flush=True)
        raise SystemExit(1)
