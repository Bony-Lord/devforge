"""Pinned optional Python libraries; no pip or global interpreter changes."""
import hashlib
import json
import os
import pathlib
import shutil
import ssl
import stat
import tempfile
import urllib.parse
import urllib.request
import zipfile


def digest(path):
    with open(path, "rb") as stream:
        value = hashlib.sha256()
        for block in iter(lambda: stream.read(65536), b""):
            value.update(block)
        return value.hexdigest()


class PackageStore:
    def __init__(self, manifest):
        self.manifest = manifest

    def info(self, cache):
        packages = []
        for entry in self.manifest["packages"]:
            file = cache / entry["filename"]
            packages.append({**entry, "installed": file.is_file() and file.stat().st_size == entry["bytes"] and digest(file) == entry["sha256"]})
        return {"id": self.manifest["id"], "installed": all(p["installed"] for p in packages), "packages": packages,
                "bytes": sum(p["bytes"] for p in packages), "path": str(cache)}

    def members(self, archive, entry):
        files = archive.infolist()
        if len(files) > entry.get("maxFiles", 1024) or sum(f.file_size for f in files) > entry.get("maxExpandedBytes", 8 * 1024 * 1024):
            raise ValueError("Invalid Python wheel limits")
        for file in files:
            parts = pathlib.PurePosixPath(file.filename)
            if parts.is_absolute() or ".." in parts.parts or "\\" in file.filename or ":" in file.filename or stat.S_ISLNK(file.external_attr >> 16):
                raise ValueError("Unsafe Python wheel member")
        return files

    def install(self, cache):
        cache.mkdir(parents=True, exist_ok=True)
        context = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
        for entry in self.info(cache)["packages"]:
            if entry["installed"]:
                continue
            temporary = None
            try:
                with urllib.request.urlopen(entry["url"], context=context, timeout=30) as response:
                    if urllib.parse.urlparse(response.url).hostname != "files.pythonhosted.org":
                        raise ValueError("Unexpected Python package origin")
                    with tempfile.NamedTemporaryFile(dir=cache, prefix=".download-", delete=False) as target:
                        temporary = pathlib.Path(target.name)
                        size = 0
                        while True:
                            block = response.read(65536)
                            if not block:
                                break
                            size += len(block)
                            if size > entry["bytes"]:
                                raise ValueError("Python package exceeds its pinned size")
                            target.write(block)
                if size != entry["bytes"] or digest(temporary) != entry["sha256"]:
                    raise ValueError("Python package checksum mismatch")
                with zipfile.ZipFile(temporary) as archive:
                    self.members(archive, entry)
                os.replace(temporary, cache / entry["filename"])
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
        return self.info(cache)

    def materialize(self, cache):
        """Jedi reads its typeshed data as files, so verified wheels need directories."""
        status = self.info(cache)
        if not status["installed"]:
            raise ValueError("Download Python intelligence tools first")
        imports = []
        for entry in status["packages"]:
            destination = cache / "libraries" / (entry["name"] + "-" + entry["sha256"][:16])
            marker = destination / ".devforge-package.json"
            try:
                ready = marker.is_file() and json.loads(marker.read_text(encoding="utf-8")).get("sha256") == entry["sha256"]
            except (OSError, ValueError):
                ready = False
            if not ready:
                destination.parent.mkdir(exist_ok=True)
                if not destination.resolve().is_relative_to(cache.resolve()):
                    raise ValueError("Python library cache escaped its root")
                temporary = pathlib.Path(tempfile.mkdtemp(prefix=".unpack-", dir=destination.parent))
                try:
                    with zipfile.ZipFile(cache / entry["filename"]) as archive:
                        for file in self.members(archive, entry):
                            target = temporary / file.filename
                            if file.is_dir():
                                target.mkdir(parents=True, exist_ok=True)
                            else:
                                target.parent.mkdir(parents=True, exist_ok=True)
                                target.write_bytes(archive.read(file))
                    (temporary / marker.name).write_text(json.dumps({"sha256": entry["sha256"]}), encoding="utf-8")
                    if destination.exists():
                        shutil.rmtree(destination)
                    os.replace(temporary, destination)
                finally:
                    if temporary.exists():
                        if not temporary.resolve().is_relative_to(cache.resolve()):
                            raise ValueError("Python extraction cache escaped its root")
                        shutil.rmtree(temporary)
            imports.append(str(destination))
        return imports
