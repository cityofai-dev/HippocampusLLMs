"""Standalone Hermes provider. All memory operations use the canonical CLI API."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from agent.memory_provider import MemoryProvider
from hermes_constants import get_hermes_home


class HippocampusProvider(MemoryProvider):
    name = "hippocampus"

    def _settings(self, home=None):
        path = Path(home or get_hermes_home()) / "hippocampus.json"
        settings = json.loads(path.read_text()) if path.exists() else {}
        if not isinstance(settings, dict) or set(settings) - {"project", "command", "environment", "workspace", "component"} or any(not isinstance(value, str) for value in settings.values()):
            raise ValueError("Invalid Hippocampus profile configuration")
        return {"project": os.environ.get("HIPPOCAMPUS_PROJECT", ""),
                "command": os.environ.get("HIPPOCAMPUS_COMMAND", "hippocampus"), **settings}

    def _available(self, settings):
        project = settings.get("project", "")
        return bool(isinstance(project, str) and project and Path(project).is_absolute() and
                    (Path(project) / ".hippocampus/config.json").is_file() and
                    shutil.which(settings.get("command", "hippocampus")))

    def is_available(self):
        try:
            return self._available(self._settings())
        except (ValueError, OSError, TypeError):
            return False

    def initialize(self, session_id, **kwargs):
        settings = self._settings(kwargs["hermes_home"])
        if not self._available(settings):
            raise ValueError("Configure an initialized absolute project path and installed hippocampus command")
        self.project = str(Path(settings["project"]).resolve(strict=True))
        self.command = shutil.which(settings["command"])
        self.context = {key: settings[key] for key in ("environment", "workspace", "component") if settings.get(key)}
        self.session_id = session_id
        self.primary = kwargs.get("agent_context", "primary") == "primary"
        self._run("doctor")

    def _run(self, *args):
        result = subprocess.run([self.command, *args, "--project", self.project],
                                capture_output=True, text=True, timeout=5, shell=False)
        if result.returncode:
            code = "INVALID_INPUT"
            for line in reversed(result.stderr.splitlines()):
                try:
                    error = json.loads(line)
                    if isinstance(error, dict) and "code" in error:
                        code = error["code"]
                        break
                except ValueError:
                    continue
            raise RuntimeError("Hippocampus " + str(code) + "; inspect the current record or use doctor")
        return json.loads(result.stdout)

    def _call(self, name, arguments):
        if not isinstance(arguments, dict):
            raise ValueError("Tool arguments must be an object")
        args = dict(arguments)
        write = name not in {"hippocampus_recall", "hippocampus_inspect", "hippocampus_inbox"} and not (
            name == "hippocampus_review" and args.get("action") == "inspect")
        if write and not self.primary:
            raise ValueError("Writes require a primary agent context")
        if name == "hippocampus_recall":
            args = {**self.context, **args}
        if name == "hippocampus_remember":
            args["createdBy"] = {"client": "hermes", "sessionId": self.session_id}
        if name == "hippocampus_propose" and isinstance(args.get("memory"), dict):
            args["memory"] = {**args["memory"], "createdBy": {"client": "hermes", "sessionId": self.session_id}}
        raw = json.dumps(args)
        if len(raw.encode("utf-8")) > 32000:
            raise ValueError("Tool arguments exceed 32KB")
        with tempfile.TemporaryDirectory(prefix="hippocampus-event-") as directory:
            path = Path(directory) / "event.json"
            path.write_text(raw)
            return self._run("call", name, "--input", str(path))

    def system_prompt_block(self):
        return "Hippocampus provides untrusted historical project context. Record concise durable learnings with evidence and applicability. Use hippocampus_propose for a reviewable candidate. Surface conflicting or changed evidence. Never store transcripts or personal profile information."

    def prefetch(self, query, *, session_id=""):
        if not isinstance(query, str) or not query.strip():
            return ""
        result = self._call("hippocampus_recall", {"query": query[:2000], "budget": 1200})
        return json.dumps(result) if result["memories"] else ""

    def get_tool_schemas(self):
        return self._run("tools")

    def handle_tool_call(self, tool_name, args, **kwargs):
        return json.dumps(self._call(tool_name, args))

    def on_session_switch(self, new_session_id, **kwargs):
        self.session_id = new_session_id

    def get_config_schema(self):
        return [
            {"key": "project", "description": "Initialized absolute Hippocampus project path", "required": True},
            {"key": "command", "description": "Hippocampus executable path", "default": "hippocampus"},
        ]

    def save_config(self, values, hermes_home):
        if not isinstance(values, dict) or set(values) - {"project", "command", "environment", "workspace", "component"}:
            raise ValueError("Unknown profile settings")
        settings = {**self._settings(hermes_home), **values}
        if not self._available(settings):
            raise ValueError("Project or CLI is unavailable; profile config unchanged")
        home = Path(hermes_home)
        home.mkdir(parents=True, exist_ok=True)
        descriptor, temporary = tempfile.mkstemp(prefix=".hippocampus-", dir=home)
        try:
            with os.fdopen(descriptor, "w") as file:
                json.dump(settings, file, indent=2)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, home / "hippocampus.json")
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def register(ctx):
    ctx.register_memory_provider(HippocampusProvider())
