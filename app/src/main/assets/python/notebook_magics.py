"""Small explicit notebook shell/magic adapter; execution remains in the trusted kernel.

This does not implement IPython. Python strings/comments are left untouched and
transformed line commands retain their original line numbers for tracebacks.
"""
import contextlib
import codecs
import io
import importlib
import os
import pathlib
import re
import runpy
import shlex
import subprocess
import sys
import time
import tokenize


class ShellOutput(list):
    @property
    def s(self):
        return " ".join(self)

    @property
    def n(self):
        return "\n".join(self)


class Magics:
    def __init__(self, namespace, on_environment_changed=None):
        self.namespace = namespace
        self.on_environment_changed = on_environment_changed
        self.previous_directory = os.getcwd()
        namespace["__devforge_magic__"] = self.line
        namespace["__devforge_shell__"] = self.shell

    def args(self, value):
        values = shlex.split(value, posix=os.name != "nt")
        return [v[1:-1] if os.name == "nt" and len(v) > 1 and v[0] == v[-1] and v[0] in "\"'" else v for v in values]

    def shell(self, command, capture=False):
        if not command.strip():
            return ShellOutput() if capture else None
        # A bare pip command belongs to this notebook's interpreter. Compound
        # shell commands retain normal shell semantics.
        try:
            arguments = self.args(command)
        except ValueError:
            arguments = []
        if arguments and re.fullmatch(r"pip(?:3(?:\.\d+)?)?(?:\.exe)?", arguments[0], re.IGNORECASE) and not re.search(r"[|;&<>]", command):
            result = self.process([sys.executable, "-m", "pip", *arguments[1:]], capture=capture)
            importlib.invalidate_caches()
            if self.namespace.get("_exit_code") and not capture:
                raise RuntimeError("pip failed in " + sys.executable + " (exit " + str(self.namespace["_exit_code"]) + ")")
            if len(arguments) > 1 and arguments[1] in ("install", "uninstall") and not self.namespace.get("_exit_code") and self.on_environment_changed:
                self.on_environment_changed()
            return result
        return self.process(command, shell=True, capture=capture)

    def process(self, command, shell=False, capture=False):
        process = subprocess.Popen(command, shell=shell,
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT)
        chunks, stored = [], 0
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        try:
            while True:
                raw = process.stdout.read1(4096)
                line = decoder.decode(raw, final=not raw)
                if capture:
                    if stored < 1024 * 1024:
                        part = line[:1024 * 1024 - stored]
                        chunks.append(part)
                        stored += len(part)
                else:
                    print(line, end="", flush=True)
                if not raw:
                    break
            status = process.wait()
        finally:
            process.stdout.close()
            if process.poll() is None:
                process.kill()
                process.wait()
        self.namespace["_exit_code"] = status
        if status and not capture:
            print("[Shell exited with code %s]" % status, file=sys.stderr)
        return ShellOutput("".join(chunks).splitlines()) if capture else None

    def argv(self, arguments):
        return self.process(arguments)

    def line(self, name, value):
        name = name.lower()
        if name == "pwd":
            return os.getcwd()
        if name == "cd":
            args = self.args(value)
            if len(args) > 1:
                raise ValueError("%cd expects one directory; quote spaces")
            target = self.previous_directory if args == ["-"] else os.path.expanduser(args[0] if args else "~")
            previous = os.getcwd()
            os.chdir(target)
            self.previous_directory = previous
            print(os.getcwd())
        elif name in ("ls", "dir"):
            args = self.args(value)
            for entry in sorted(pathlib.Path(args[0] if args else ".").iterdir()):
                print(entry.name + ("/" if entry.is_dir() else ""))
        elif name == "env":
            if not value:
                return dict(os.environ)
            if "=" in value:
                key, content = value.split("=", 1)
                key = key.strip()
                if not re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", key):
                    raise ValueError("Invalid environment variable")
                os.environ[key] = content.strip()
            else:
                return os.environ.get(value.strip(), "")
        elif name == "pip":
            arguments = self.args(value)
            self.argv([sys.executable, "-m", "pip", *arguments])
            importlib.invalidate_caches()
            if self.namespace.get("_exit_code"):
                raise RuntimeError("pip failed in " + sys.executable + " (exit " + str(self.namespace["_exit_code"]) + ")")
            if arguments and arguments[0] in ("install", "uninstall") and self.on_environment_changed:
                self.on_environment_changed()
        elif name in ("system", "sc"):
            return self.shell(value)
        elif name == "sx":
            return self.shell(value, capture=True)
        elif name == "run":
            args = self.args(value)
            if not args:
                raise ValueError("%run expects a Python file")
            previous = sys.argv
            try:
                sys.argv = args
                result = runpy.run_path(args[0], init_globals=self.namespace, run_name="__main__")
                self.namespace.update({k: v for k, v in result.items() if not k.startswith("__")})
            finally:
                sys.argv = previous
        elif name == "time":
            start = time.perf_counter()
            exec(compile(value, "<%time>", "exec"), self.namespace)
            print("Wall time: %.3f ms" % ((time.perf_counter() - start) * 1000))
        elif name in ("lsmagic", "help"):
            print("!command, output = !command; %pwd %cd %ls %env %pip %run %time %sx %system; %%bash %%sh %%cmd %%time %%writefile %%capture")
        else:
            raise ValueError("Unsupported magic %" + name + "; use !command for system commands")

    def cell(self, source):
        lines = source.splitlines(True)
        first = next((i for i, line in enumerate(lines) if line.strip()), None)
        if first is None or not lines[first].startswith("%%"):
            return False
        header = lines[first][2:].strip().split(None, 1)
        name, options = header[0].lower(), header[1] if len(header) > 1 else ""
        body = "".join(lines[first + 1:])
        if name in ("bash", "sh", "cmd"):
            arguments = [name, "-c", body] if name != "cmd" else [os.environ.get("COMSPEC", "cmd.exe"), "/d", "/s", "/c", body]
            self.argv(arguments)
        elif name == "writefile":
            args = self.args(options)
            append = args and args[0] == "-a"
            if append:
                args.pop(0)
            if len(args) != 1:
                raise ValueError("%%writefile [-a] expects one file path")
            with open(args[0], "a" if append else "w", encoding="utf-8") as output:
                output.write(body)
        elif name == "time":
            self.line("time", self.transform(body))
        elif name == "capture":
            if options and not options.isidentifier():
                raise ValueError("%%capture accepts an optional variable name")
            output, error = io.StringIO(), io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(error):
                exec(compile(self.transform(body), "<%%capture>", "exec"), self.namespace)
            if options:
                self.namespace[options] = {"stdout": output.getvalue(), "stderr": error.getvalue()}
        else:
            raise ValueError("Unsupported cell magic %%" + name)
        return True

    def transform(self, source):
        strings, continuation, depth = [], set(), 0
        try:
            for token in tokenize.generate_tokens(io.StringIO(source).readline):
                if depth:
                    continuation.add(token.start[0])
                if token.type == tokenize.OP:
                    if token.string in ("(", "[", "{"):
                        depth += 1
                    elif token.string in (")", "]", "}"):
                        depth = max(0, depth - 1)
                if token.type in (tokenize.STRING, tokenize.COMMENT):
                    strings.append((token.start, token.end))
        except (tokenize.TokenError, IndentationError):
            pass  # The Python compiler still diagnoses malformed Python below.
        result = []
        for number, line in enumerate(source.splitlines(True), 1):
            match = re.match(r"^([ \t]*)(?:(\w+)\s*=\s*)?([!%])(.*?)(\r?\n)?$", line)
            if not match:
                result.append(line)
                continue
            indent, target, prefix, body, ending = match.groups()
            column = line.index(prefix, len(indent))
            if number in continuation or any(start <= (number, column) < end for start, end in strings):
                result.append(line)
                continue
            if prefix == "!":
                capture = bool(target) or body.startswith("!")
                call = "__devforge_shell__(%r, capture=%r)" % (body[1:] if body.startswith("!") else body, capture)
            else:
                parts = body.strip().split(None, 1)
                if not parts:
                    raise SyntaxError("Expected a magic name")
                call = "__devforge_magic__(%r, %r)" % (parts[0], parts[1] if len(parts) > 1 else "")
            result.append(indent + (target + " = " if target else "") + call + (ending or ""))
        return "".join(result)
