"""DevForge's optional Python style tools. No project code is executed."""
import ast
import configparser
import contextlib
import hashlib
import io
import json
import os
import pathlib
import re
import ssl
import sys
import tempfile
import urllib.request
import urllib.parse
import zipfile

MAX_SOURCE = 512 * 1024
MANIFEST = json.loads(pathlib.Path(__file__).with_name("style-manifest.json").read_text(encoding="utf-8"))


from package_store import PackageStore, digest
store = PackageStore(MANIFEST)

def info(cache):
    return store.info(cache)

def install(cache):
    if sys.version_info < (3, 10):
        raise ValueError("Python 3.10 or newer is required for these style tools")
    return store.install(cache)


def settings(root, source_path):
    options = {"max_line_length": 79, "indent_size": 4, "ignore": None, "select": [], "aggressive": 0}
    paths = []
    if not root:
        return options, paths
    root = pathlib.Path(root).resolve()
    current = pathlib.Path(source_path).resolve().parent
    if not current.is_relative_to(root):
        raise ValueError("Python source outside project")
    directories = []
    while True:
        directories.append(current)
        if current == root:
            break
        current = current.parent
    for directory in reversed(directories):
        for name in ["setup.cfg", "tox.ini", ".pycodestyle", ".pep8", "pyproject.toml"]:
            file = directory / name
            if not file.is_file():
                continue
            if not file.resolve().is_relative_to(root) or file.stat().st_size > 128 * 1024:
                raise ValueError("Unsafe or oversized Python style configuration")
            text = file.read_text(encoding="utf-8-sig")
            if name.endswith(".toml"):
                try:
                    import tomllib
                except ImportError:
                    import tomli as tomllib
                document = tomllib.loads(text).get("tool", {})
                values = {**document.get("autopep8", {}), **document.get("devforge", {}).get("python", {})}
            else:
                config = configparser.ConfigParser(interpolation=None)
                config.read_string(text)
                values = dict(config["pycodestyle"]) if config.has_section("pycodestyle") else {}
            for key, value in values.items():
                key = key.replace("-", "_")
                if key in ("max_line_length", "indent_size"):
                    value = int(value)
                    if not (40 <= value <= 300 if key == "max_line_length" else 1 <= value <= 16):
                        raise ValueError("Invalid Python style option: " + key)
                    options[key] = value
                elif key in ("ignore", "select"):
                    codes = re.split(r"[,\s]+", value.strip()) if isinstance(value, str) else value
                    if not isinstance(codes, list) or len(codes) > 100 or any(not isinstance(c, str) or not re.fullmatch(r"[EW]\d{0,3}", c) for c in codes if c):
                        raise ValueError("Invalid Python style codes")
                    options[key] = [c for c in codes if c]
            if values:
                paths.append(str(file))
    return options, paths


def notebook_source(source):
    from notebook_magics import Magics
    lines = source.splitlines(keepends=True)
    first = next((i for i, line in enumerate(lines) if line.strip()), None)
    if first is not None and lines[first].startswith("%%"):
        return source, {}, True  # A cell magic owns its entire body.
    transformed = Magics({}).transform(source).splitlines(keepends=True)
    nonce = hashlib.sha256(source.encode()).hexdigest()[:16]
    while nonce in source:
        nonce += "x"
    saved = {}
    for index, (before, after) in enumerate(zip(lines, transformed)):
        if before == after:
            continue
        marker = "__DEVFORGE_MAGIC_" + nonce + "_" + str(index)
        indent = before[:len(before) - len(before.lstrip(" \t"))]
        saved[marker] = before.lstrip(" \t").rstrip("\r\n")
        lines[index] = indent + "pass  # " + marker + ("\n" if before.endswith("\n") else "")
    return "".join(lines), saved, False


class NormalizeImports(ast.NodeTransformer):
    def visit_Import(self, node):
        return [ast.Import(names=[alias]) for alias in node.names]


def semantic_tree(source):
    return ast.dump(NormalizeImports().visit(ast.parse(source)), include_attributes=False)


def request(cache, value):
    if sys.version_info < (3, 10):
        raise RuntimeError("Python style tools require Python 3.10 or newer")
    state = info(cache)
    if not state["installed"]:
        raise RuntimeError("PYTHON_STYLE_MISSING: Download the Python style addon")
    sys.path[:0] = [str(cache / p["filename"]) for p in MANIFEST["packages"]]
    import autopep8
    import pycodestyle
    source = value.get("text")
    if not isinstance(source, str) or len(source.encode("utf-8")) > MAX_SOURCE or "\0" in source:
        raise ValueError("Python analysis accepts up to 512 KiB")
    text, magics, skipped = notebook_source(source) if value.get("notebook") else (source, {}, False)
    options, files = settings(value.get("root"), value.get("path"))
    if skipped:
        return {"text": source, "diagnostics": [], "skipped": True, "config": files}
    try:
        original_tree = semantic_tree(text)
    except SyntaxError as error:
        return {"text": source, "diagnostics": [{"line": max(0, (error.lineno or 1) - 1), "column": max(0, (error.offset or 1) - 1), "code": "SyntaxError", "message": error.msg, "severity": "error"}], "config": files}
    if value.get("action") == "format":
        selected = {k: v for k, v in options.items() if v is not None}
        selected["max_line_length"] = options["max_line_length"]
        result = autopep8.fix_code(text, options=selected, apply_config=False)
        if semantic_tree(result) != original_tree:
            raise ValueError("Formatter changed Python semantics; original text retained")
        for marker, command in magics.items():
            pattern = r"(?m)^([ \t]*)pass\s*# " + re.escape(marker) + r"[^\r\n]*"
            result, count = re.subn(pattern, lambda m: m[1] + command, result)
            if count != 1:
                raise ValueError("Notebook command changed during formatting; original text retained")
        return {"text": result, "diagnostics": [], "config": files}
    if value.get("action") != "analyze":
        raise ValueError("Unknown Python style action")
    diagnostics = []

    class Report(pycodestyle.BaseReport):
        def error(self, line_number, offset, text, check):
            code = super().error(line_number, offset, text, check)
            if code and not (value.get("notebook") and code == "W292") and len(diagnostics) < 300 and not any(marker in self.lines[line_number - 1] for marker in magics):
                diagnostics.append({"line": line_number - 1, "column": offset, "code": code, "message": text[5:], "severity": "warning"})
            return code

    kwargs = {"max_line_length": options["max_line_length"], "indent_size": options["indent_size"], "select": options["select"], "reporter": Report, "quiet": True}
    if options["ignore"] is not None:
        kwargs["ignore"] = options["ignore"]
    guide = pycodestyle.StyleGuide(**kwargs)
    # Magic placeholders keep syntax/line mapping valid, but are not Python
    # statements for import-placement checks such as E402.
    lint_lines = ["\n" if any(marker in line for marker in magics) else line for line in text.splitlines(keepends=True)]
    pycodestyle.Checker(lines=lint_lines, options=guide.options, report=guide.init_report(Report)).check_all()
    return {"diagnostics": diagnostics, "config": files}


def main():
    action, cache = sys.argv[1], pathlib.Path(sys.argv[2]).resolve()
    if action == "info":
        return info(cache)
    if action == "install":
        return install(cache)
    if action == "remove":
        for item in MANIFEST["packages"]:
            (cache / item["filename"]).unlink(missing_ok=True)
        return info(cache)
    value = json.loads(sys.stdin.buffer.read(MAX_SOURCE * 3 + 8192).decode("utf-8"))
    with contextlib.redirect_stdout(io.StringIO()):
        return request(cache, {**value, "action": action})


if __name__ == "__main__":
    try:
        answer = {"ok": True, **main()}
    except Exception as error:
        answer = {"ok": False, "error": str(error), "kind": type(error).__name__}
    print(json.dumps(answer, ensure_ascii=True))
