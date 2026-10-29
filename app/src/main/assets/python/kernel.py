"""DevForge's local Python session. JSON-lines transport; not a security sandbox.

Notebook files are never executed on open. Hosts enforce workspace trust and
own process lifetime; restart discards state and cancels a running cell.
"""
import ast
import builtins
import contextlib
import io
import json
import linecache
import os
import sys
import traceback
from notebook_magics import Magics

# User imports follow the notebook working directory, not the IDE helper folder.
# An empty entry also follows explicit %cd changes, as in an interactive kernel.
sys.path.insert(0, "")

MAX_INPUT = 2 * 1024 * 1024
MAX_OUTPUT = 1024 * 1024
protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
# Native writes and child processes must not corrupt the JSON protocol channel.
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
request_id = None
count = 0
budget = 0
def notebook_input(prompt=""):
    raise RuntimeError("input() in notebook cells is not supported yet; run a .py file for interactive console input")


namespace = {"__name__": "__main__", "__builtins__": {**vars(builtins), "input": notebook_input}}
magics = Magics(namespace, on_environment_changed=lambda: send("environmentChanged", executable=sys.executable))


def send(kind, **fields):
    protocol.write(json.dumps({"id": request_id, "type": kind, **fields}, ensure_ascii=True) + "\n")


class Stream(io.TextIOBase):
    encoding = "utf-8"

    def __init__(self, name):
        self.name = name

    def writable(self):
        return True

    def isatty(self):
        return False

    def write(self, text):
        global budget
        if not isinstance(text, str):
            raise TypeError("write() requires str")
        remaining = max(0, MAX_OUTPUT - budget)
        part = text[:remaining]
        for at in range(0, len(part), 8192):
            send("stream", name=self.name, text=part[at:at + 8192], count=count)
        if budget <= MAX_OUTPUT < budget + len(text):
            send("stream", name="stderr", text="\n[Cell output truncated at 1 MB]\n", count=count)
        budget += len(text)
        return len(text)

    def flush(self):
        protocol.flush()


def execute(source, filename):
    global count, budget
    count += 1
    budget = 0
    namespace["__file__"] = filename
    linecache.cache[filename] = (len(source), None, source.splitlines(True), filename)
    # Keep tracebacks useful without an unbounded cache across long sessions.
    if len(linecache.cache) > 256:
        linecache.clearcache()
    send("busy", count=count)
    try:
        with contextlib.redirect_stdout(Stream("stdout")), contextlib.redirect_stderr(Stream("stderr")):
            if magics.cell(source):
                return
            tree = ast.parse(magics.transform(source), filename, "exec")
            expression = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
            exec(compile(tree, filename, "exec"), namespace)
            if expression:
                value = eval(compile(ast.Expression(expression.value), filename, "eval"), namespace)
                if value is not None:
                    namespace["_"] = value
                    send("result", text=repr(value)[:MAX_OUTPUT], count=count)
    except BaseException as error:
        send("error", ename=type(error).__name__, evalue=str(error)[:65536],
             traceback=traceback.format_exception(type(error), error, error.__traceback__)[-32:], count=count)
    finally:
        send("idle", count=count)


send("ready", version=sys.version.split()[0], executable=sys.executable)
for raw in sys.stdin:
    try:
        if len(raw) > MAX_INPUT:
            raise ValueError("Cell exceeds 2 MB")
        request = json.loads(raw)
        request_id = request.get("id")
        if not isinstance(request_id, str) or len(request_id) > 128:
            raise ValueError("Invalid request id")
        source = request.get("code")
        if not isinstance(source, str) or len(source) > MAX_INPUT:
            raise ValueError("Invalid cell source")
        filename = request.get("filename", "<notebook>")
        if not isinstance(filename, str) or len(filename) > 4096:
            raise ValueError("Invalid cell filename")
        execute(source, filename)
    except Exception as error:
        send("error", ename=type(error).__name__, evalue=str(error), traceback=[])
        send("idle", count=count)
