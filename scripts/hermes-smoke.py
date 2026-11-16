"""Run with Hermes's Python, with the Hermes checkout on PYTHONPATH. No model needed."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

repository = Path(__file__).resolve().parent.parent
node = sys.argv[1]
bin_path = repository / "packages/cli/dist/index.js"
with tempfile.TemporaryDirectory(prefix="hippocampus hermes ") as temporary:
    project = Path(temporary) / "project with spaces"
    project.mkdir()
    subprocess.run([node, str(bin_path), "init", "--project", str(project)], check=True, capture_output=True)
    # An executable shim permits testing the exact provider subprocess contract.
    shim = Path(temporary) / "hippocampus"
    import shlex
    shim.write_text("#!/bin/sh\nexec " + shlex.quote(node) + " " + shlex.quote(str(bin_path)) + ' "$@"\n')
    shim.chmod(0o700)
    os.environ["HIPPOCAMPUS_PROJECT"] = str(project)
    os.environ["HIPPOCAMPUS_COMMAND"] = str(shim)
    spec = importlib.util.spec_from_file_location("hippocampus_provider", repository / "plugins/hermes/__init__.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    providers = []
    class Context:
        def register_memory_provider(self, provider):
            providers.append(provider)
    module.register(Context())
    first = providers[0]
    first.initialize("first", hermes_home=temporary)
    stored = json.loads(first.handle_tool_call("hippocampus_remember", {
        "kind": "constraint", "content": "Hermes SQLite writes require bounded busy timeouts"}))
    second = module.HippocampusProvider()
    second.initialize("second", hermes_home=temporary)
    assert stored["id"] in second.prefetch("SQLite writes")
    second.sync_turn("never persist this transcript", "or this answer")
    assert not second.prefetch("never persist transcript")
    second.on_session_switch("third")
    assert second.session_id == "third"
    # Structured native capture, idempotency and optimistic revisions use the same CLI schemas.
    rich = {"kind": "constraint", "content": "Production token rotation requires serializable transactions", "rationale": "Concurrent token consumers need isolation", "verification": "observed", "evidence": [{"type": "user", "reference": "Synthetic explicit project decision"}], "applicability": {"environments": ["production"]}, "idempotencyKey": "hermes-structured-event"}
    saved = json.loads(second.handle_tool_call("hippocampus_remember", rich))
    assert json.loads(second.handle_tool_call("hippocampus_remember", rich))["id"] == saved["id"]
    assert not second.prefetch("Production token rotation")
    assert saved["id"] in second.handle_tool_call("hippocampus_recall", {"query": "Production token rotation", "environment": "production"})
    changed = json.loads(second.handle_tool_call("hippocampus_revise", {"id": saved["id"], "expectedRevision": 1, "rationale": "Updated explicit constraint rationale"}))
    assert changed["revision"] == 2
    try:
        second.handle_tool_call("hippocampus_revise", {"id": saved["id"], "expectedRevision": 1, "content": "A stale change must fail validation"})
        raise AssertionError("Stale revision accepted")
    except RuntimeError as error:
        assert "REVISION_CONFLICT" in str(error)
    # Two profiles in a single process freeze different project targets despite env fallback.
    other_project = Path(temporary) / "other project"
    other_project.mkdir()
    subprocess.run([node, str(bin_path), "init", "--project", str(other_project)], check=True, capture_output=True)
    profile = Path(temporary) / "other profile"
    other = module.HippocampusProvider()
    other.save_config({"project": str(other_project), "command": str(shim)}, str(profile))
    other.initialize("isolated", hermes_home=str(profile))
    assert not other.prefetch("SQLite writes")
    assert stored["id"] in first.prefetch("SQLite writes")
    assert {tool["name"] for tool in other.get_tool_schemas()} >= {"hippocampus_propose", "hippocampus_revise"}
    second.primary = False
    try:
        second.handle_tool_call("hippocampus_remember", {"kind": "task", "content": "Subagent writes are rejected"})
        raise AssertionError("Write unexpectedly permitted")
    except ValueError:
        pass
    async def mcp_roundtrip():
        # Exercise Hermes's actual connection implementation, not just the SDK.
        from tools.mcp_tool import MCPServerTask
        server = MCPServerTask("hippocampus-smoke")
        try:
            await server.start({"command": node, "args": [str(bin_path), "serve", "--project", str(project)]})
            assert server.session is not None
            tools = await server.session.list_tools()
            assert len(tools.tools) == 9
            result = await server.session.call_tool("hippocampus_recall", {"query": "SQLite writes"})
            assert stored["id"] in str(result)
        finally:
            await server.shutdown()
    asyncio.run(mcp_roundtrip())
    print("PASS: Hermes native schemas, idempotency, revisions, profile isolation, transcript exclusion, write guard and actual MCP recall")
