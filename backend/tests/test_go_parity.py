"""Black-box differential tests for the legacy Python and migrated Go APIs.

Run from ``sprintpoints`` with ``uv run pytest backend/tests/test_go_parity.py``.
Set GO_SERVER_BINARY to the Go server executable (defaults to
``.tmp/sprintpoints-server``).  The test deliberately uses independent SQLite
databases and actual HTTP/WebSocket connections for both implementations.
"""
from __future__ import annotations

import asyncio
import os
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import pytest
import websockets


ROOT = Path(__file__).resolve().parents[2]
GO_BINARY = Path(os.environ.get("GO_SERVER_BINARY", ".tmp/sprintpoints-server"))
if not GO_BINARY.is_absolute():
    GO_BINARY = ROOT / GO_BINARY


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class Server:
    def __init__(self, kind: str, path: Path):
        self.kind = kind
        self.path = path
        self.port = free_port()
        self.proc: subprocess.Popen[bytes] | None = None

    @property
    def base(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        env = os.environ.copy()
        # httpx may otherwise try to load optional socksio from a workstation
        # proxy configuration, even for this loopback-only test server.
        for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
            env.pop(key, None)
        env["DATABASE_URL"] = f"sqlite+pysqlite:///{self.path}"
        if self.kind == "python":
            command = [sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", str(self.port)]
            cwd = ROOT
        else:
            command = [str(GO_BINARY)]
            cwd = ROOT
            env["LISTEN_ADDR"] = f"127.0.0.1:{self.port}"
        self.proc = subprocess.Popen(command, cwd=cwd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError(f"{self.kind} server exited with {self.proc.returncode}")
            try:
                if httpx.get(self.base + "/api/health", timeout=0.3, trust_env=False).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        self.stop()
        raise RuntimeError(f"{self.kind} server did not become ready")

    def stop(self) -> None:
        if self.proc is not None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=5)
            self.proc = None


@pytest.fixture(scope="module")
def go_binary() -> Path:
    if not GO_BINARY.is_file():
        pytest.skip(f"Go server binary not found at {GO_BINARY}; build it or set GO_SERVER_BINARY")
    return GO_BINARY


def result(response: httpx.Response) -> tuple[int, Any]:
    if response.status_code == 204:
        return response.status_code, None
    try:
        return response.status_code, response.json()
    except ValueError:
        return response.status_code, response.text


def error_result(response: httpx.Response) -> tuple[int, Any]:
    """Keep validation and business-error detail in the differential oracle."""
    status, body = result(response)
    return status, body.get("detail") if isinstance(body, dict) else body


def normalized_state(state: dict[str, Any], viewer_name: str) -> dict[str, Any]:
    """Drop generated IDs/timestamps while retaining every meaningful state field."""
    participant_names = {p["id"]: p["name"] for p in state["participants"]}
    return {
        "room": {k: state["room"][k] for k in ("name", "card_set", "revealed")}
        | {"owner": participant_names.get(state["room"]["owner_id"]),
           "active_issue": next((i["title"] for i in state["issues"] if i["id"] == state["room"]["active_issue_id"]), None),
           "host_token_visible": bool(state["room"]["host_token"])},
        "participants": [{"name": p["name"], "is_spectator": p["is_spectator"],
                          "token_visible": bool(p["token"]), "viewer": p["name"] == viewer_name}
                         for p in state["participants"]],
        "issues": [{k: i[k] for k in ("title", "description", "link", "position", "estimate")}
                   | {"archived": bool(i["archived_at"])} for i in state["issues"]],
        "votes": [{"value": v["value"], "participant": participant_names.get(v["participant_id"]),
                   "issue": next((i["title"] for i in state["issues"] if i["id"] == v["issue_id"]), None)}
                  for v in state["votes"]],
    }


def wait_for_room_state(
    client: httpx.Client,
    code: str,
    headers: dict[str, str],
    predicate: Any,
    description: str,
    timeout: float = 2.0,
) -> dict[str, Any]:
    """Wait for a committed state transition, failing clearly on timeout."""
    deadline = time.monotonic() + timeout
    last_state: dict[str, Any] = {}
    while True:
        response = client.get(f"/api/rooms/{code}", headers=headers)
        assert response.status_code == 200, f"room state read failed while waiting for {description}: {response.text}"
        last_state = response.json()
        if predicate(last_state):
            return last_state
        if time.monotonic() >= deadline:
            raise AssertionError(f"timed out waiting for {description}; last state: {last_state}")
        time.sleep(0.02)


async def ws_check(base: str, room_id: str, allowed: str, denied: str, create_headers: dict[str, str], code: str) -> tuple[bool, int, str, bool, bool]:
    """Check policy close and that a pushed notification follows committed state."""
    denied_closed = False
    try:
        async with websockets.connect(f"{base.replace('http:', 'ws:')}/api/rooms/{room_id}/ws?participantToken={denied}") as ws:
            try:
                await asyncio.wait_for(ws.recv(), timeout=1)
            except websockets.exceptions.ConnectionClosed as exc:
                denied_closed = (exc.rcvd.code if exc.rcvd else None) == 1008
    except websockets.exceptions.ConnectionClosedError as exc:
        denied_closed = (exc.rcvd.code if exc.rcvd else None) == 1008

    async with websockets.connect(f"{base.replace('http:', 'ws:')}/api/rooms/{room_id}/ws?participantToken={allowed}") as ws:
        async with httpx.AsyncClient(trust_env=False) as client:
            created = await client.post(base + f"/api/rooms/{room_id}/issues", headers=create_headers,
                                        json={"title": "WebSocket committed", "description": "", "link": ""})
            event = await asyncio.wait_for(ws.recv(), timeout=3)
            state = await client.get(base + f"/api/rooms/{code}", headers={"X-Participant-Token": allowed})
        pushed = event == '{"type":"room_updated"}'
        committed = state.status_code == 200 and any(i["title"] == "WebSocket committed" for i in state.json()["issues"])
        return denied_closed, created.status_code, event, pushed, committed


def scenario(base: str) -> dict[str, Any]:
    c = httpx.Client(base_url=base, timeout=5, trust_env=False)
    out: dict[str, Any] = {}
    out["health"] = result(c.get("/api/health"))
    payload = {"roomName": " Room ", "participantName": " Host ", "defaults": {
        "facilitatorName": "Facilitator", "firstStoryTitle": "First", "roomName": "Fallback"}}
    status_code, created = result(c.post("/api/rooms", json=payload))
    assert status_code == 201
    room, host, host_token = created["state"]["room"], created["participant"], created["hostToken"]
    participant_token, room_id, code = created["participantToken"], room["id"], room["code"]
    first_issue = created["state"]["issues"][0]["id"]
    out["create"] = (room["name"], host["name"], created["state"]["room"]["card_set"],
                     bool(host_token), bool(participant_token), host["token"] == participant_token)
    cors = c.options("/api/rooms", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    out["cors"] = (cors.status_code, cors.headers.get("access-control-allow-origin"),
                   cors.headers.get("access-control-allow-methods"))

    join_status, joined = result(c.post(f"/api/rooms/{code.lower()}/join", json={"name": " Guest ", "isSpectator": False}))
    assert join_status == 201
    guest_id, guest_token = joined["participant"]["id"], joined["participantToken"]
    spect_status, spectator = result(c.post(f"/api/rooms/{code}/join", json={"name": "Spectator", "isSpectator": True}))
    assert spect_status == 201
    spectator_id, spectator_token = spectator["participant"]["id"], spectator["participantToken"]
    member_state = c.get(f"/api/rooms/{code}", headers={"X-Participant-Token": guest_token}).json()
    host_state = c.get(f"/api/rooms/{code}", headers={"X-Host-Token": host_token}).json()
    out["membership_and_secrecy"] = (
        result(c.get(f"/api/rooms/{code}"))[0],
        result(c.get(f"/api/rooms/{code}", headers={"X-Participant-Token": spectator_token}))[0],
        result(c.get(f"/api/rooms/{code}", headers={"X-Participant-Token": "wrong"}))[0],
        member_state["room"]["host_token"], member_state["participants"][0]["token"],
        host_state["room"]["host_token"] == host_token,
        next(p["token"] for p in host_state["participants"] if p["id"] == guest_id),
    )
    other_status, other = result(c.post("/api/rooms", json={**payload, "roomName": "Other"}))
    assert other_status == 201
    other_id = other["state"]["room"]["id"]
    out["cross_room"] = (
        error_result(c.get(f"/api/rooms/{code}", headers={"X-Participant-Token": other["participantToken"]})),
        error_result(c.post(f"/api/rooms/{room_id}/issues", headers={"X-Host-Token": other["hostToken"]}, json={"title":"denied"})),
        error_result(c.put(f"/api/rooms/{other_id}/issues/{first_issue}/votes/{guest_id}", headers={"X-Participant-Token":guest_token}, json={"value":"3"})),
        error_result(c.post(f"/api/rooms/{other_id}/issues/{first_issue}/reset-votes", headers={"X-Host-Token":other["hostToken"]})),
        error_result(c.patch(f"/api/rooms/{other_id}/issues/{first_issue}/archive", headers={"X-Host-Token":other["hostToken"]}, json={"nextActiveIssueId":None})),
        error_result(c.patch(f"/api/rooms/{other_id}/active-issue", headers={"X-Host-Token":other["hostToken"]}, json={"issueId":first_issue})),
        error_result(c.post(f"/api/rooms/{room_id}/transfer-ownership", headers={"X-Host-Token":host_token}, json={"participantId":other["participant"]["id"]})),
    )

    H = {"X-Host-Token": host_token}
    P = {"X-Participant-Token": guest_token}
    # Missing/type/null handling is part of the public contract.
    out["validation"] = tuple(error_result(c.post(url, headers=headers, json=body)) for url, headers, body in [
        ("/api/rooms", {}, {}), (f"/api/rooms/{code}/join", {}, {"name": 5, "isSpectator": False}),
        (f"/api/rooms/{code}/join", {}, {"name": "x"}),
        (f"/api/rooms/{room_id}/issues", H, {"title": "x", "description": None, "link": ""}),
        (f"/api/rooms/{code}/join", {}, {"name": "Bad bool", "isSpectator": None}),
    ])
    out["host_denial"] = error_result(c.post(f"/api/rooms/{room_id}/issues", json={"title":"denied", "description":"", "link":""}))
    bool_join_status, bool_join = result(c.post(f"/api/rooms/{code}/join", json={"name":"Boolean coercion", "isSpectator":"yes"}))
    out["bool_coercion"] = (bool_join_status, bool_join["participant"]["is_spectator"])

    # Empty imports do not choose an active issue; a later import chooses its
    # first nonblank row while retaining the blank-row positional gap.
    imp_room_status, imp_room = result(c.post("/api/rooms", json={**payload, "roomName":"Import lifecycle"}))
    assert imp_room_status == 201
    ir, it = imp_room["state"]["room"], imp_room["hostToken"]
    ih = {"X-Host-Token":it}
    c.patch(f"/api/rooms/{ir['id']}/active-issue", headers=ih, json={"issueId":None})
    empty_status, empty_rows = result(c.post(f"/api/rooms/{ir['id']}/issues/import", headers=ih, json={"issues":[]}))
    blank_status, blank_rows = result(c.post(f"/api/rooms/{ir['id']}/issues/import", headers=ih, json={"issues":[{"title":"  "}]}))
    seed_status, seed_rows = result(c.post(f"/api/rooms/{ir['id']}/issues/import", headers=ih, json={"issues":[{"title":" "}, {"title":"Seed"}]}))
    is_state = c.get(f"/api/rooms/{ir['code']}", headers={"X-Host-Token":it}).json()
    out["empty_active_import"] = (empty_status, empty_rows, blank_status, blank_rows, seed_status,
                                  [(x["title"], x["description"], x["link"], x["estimate"], x["position"]) for x in seed_rows],
                                  is_state["room"]["active_issue_id"] == seed_rows[0]["id"])

    # Imported blank rows preserve positional gaps; omitted string fields default to empty.
    imp_status, imported = result(c.post(f"/api/rooms/{room_id}/issues/import", headers=H, json={"issues":[
        {"title":"Imported A", "estimate":" 5 "}, {"title":"   "}, {"title":" Imported C ", "description":" desc "}]}))
    assert imp_status == 201
    out["imports"] = [(i["title"], i["description"], i["link"], i["estimate"], i["position"]) for i in imported]
    issue_a, issue_c = imported[0]["id"], imported[1]["id"]
    out["create_blank"] = result(c.post(f"/api/rooms/{room_id}/issues", headers=H, json={"title":"   ", "description":"", "link":""}))[0]
    empty_import_status, empty_import = result(c.post(f"/api/rooms/{room_id}/issues/import", headers=H, json={"issues":[]}))
    out["empty_import"] = (empty_import_status, empty_import)
    update_status, updated = result(c.patch(f"/api/issues/{issue_a}", headers=H, json={"title":" Updated ", "description":" D ", "link":" L "}))
    out["issue_update"] = (update_status, updated["title"], updated["description"], updated["link"])
    out["estimate"] = result(c.patch(f"/api/issues/{issue_a}/estimate", headers=H, json={"value":"8"}))[0]
    out["activate"] = result(c.patch(f"/api/rooms/{room_id}/active-issue", headers=H, json={"issueId":issue_a}))[0]
    out["vote"] = result(c.put(f"/api/rooms/{room_id}/issues/{issue_a}/votes/{guest_id}", headers=P, json={"value":"5"}))[0]
    out["vote_update"] = result(c.put(f"/api/rooms/{room_id}/issues/{issue_a}/votes/{guest_id}", headers=P, json={"value":"8"}))[0]
    out["spectator_vote"] = error_result(c.put(f"/api/rooms/{room_id}/issues/{issue_a}/votes/{spectator_id}", headers={"X-Participant-Token":spectator_token}, json={"value":"3"}))
    out["reveal"] = result(c.patch(f"/api/rooms/{room_id}/reveal", headers=H))[0]
    assert out["reveal"] == 204
    revealed = wait_for_room_state(c, code, P, lambda s: s["room"]["revealed"], "votes to be revealed")
    out["vote_state"] = (revealed["room"]["revealed"], [(v["value"], v["participant_id"] == guest_id) for v in revealed["votes"]])
    out["spectator_mode"] = result(c.patch(f"/api/participants/{guest_id}", headers=P, json={"isSpectator":True}))[0]
    assert out["spectator_mode"] == 200
    state = wait_for_room_state(c, code, P,
                                lambda s: next((p["is_spectator"] for p in s["participants"] if p["id"] == guest_id), False)
                                and not any(v["participant_id"] == guest_id and v["issue_id"] == issue_a for v in s["votes"]),
                                "spectator mode and active vote removal")
    out["spectator_removal"] = (state["participants"][1]["is_spectator"], len(state["votes"]))
    out["spectator_removal"] += (normalized_state(state, "Guest"),)
    out["heartbeat"] = result(c.post(f"/api/participants/{guest_id}/heartbeat", headers=P))[0]
    out["vote_delete"] = result(c.delete(f"/api/issues/{issue_a}/votes/{guest_id}", headers=P))[0]
    out["reset_votes"] = result(c.post(f"/api/rooms/{room_id}/issues/{issue_a}/reset-votes", headers=H))[0]
    out["unarchive"] = result(c.patch(f"/api/rooms/{room_id}/issues/{issue_c}/unarchive", headers=H))[0]
    # Archive and archive-estimated return timestamps; compare only stable fields.
    ae_status, ae = result(c.post(f"/api/rooms/{room_id}/issues/archive-estimated", headers=H, json={"nextActiveIssueId":None}))
    out["archive_estimated"] = (ae_status, [(i["title"], i["estimate"], bool(i["archived_at"])) for i in ae])
    ar_status, archived = result(c.patch(f"/api/rooms/{room_id}/issues/{issue_a}/archive", headers=H, json={"nextActiveIssueId":issue_c}))
    out["archive"] = (ar_status, archived["title"], archived["estimate"], bool(archived["archived_at"]))

    # Ownership transfer rotates the credential and invalidates the old one.
    out["transfer_denial"] = error_result(c.post(f"/api/rooms/{room_id}/transfer-ownership", json={"participantId":guest_id}))
    out["transfer"] = result(c.post(f"/api/rooms/{room_id}/transfer-ownership", headers=H, json={"participantId":guest_id}))[0]
    assert out["transfer"] == 204
    transferred = wait_for_room_state(c, code, P, lambda s: s["room"]["owner_id"] == guest_id
                                      and bool(s["room"]["host_token"])
                                      and s["room"]["host_token"] != host_token,
                                      "ownership transfer and host-token rotation")
    new_host = transferred["room"]["host_token"]
    out["transfer_state"] = (transferred["room"]["owner_id"] == guest_id, bool(new_host), new_host != host_token,
                              error_result(c.post(f"/api/rooms/{room_id}/issues", headers=H, json={"title":"stale", "description":"", "link":""})),
                              result(c.post(f"/api/rooms/{room_id}/issues", headers={"X-Host-Token":new_host}, json={"title":"valid", "description":"", "link":""}))[0])

    # Wrong-room deletes must fail. Then exercise participant and issue deletion and room reset.
    out["wrong_room_delete"] = error_result(c.delete(f"/api/rooms/{other['state']['room']['id']}/participants/{guest_id}", headers={"X-Host-Token":other["hostToken"]}))
    out["delete_participant"] = result(c.delete(f"/api/rooms/{room_id}/participants/{spectator_id}", headers={"X-Host-Token":new_host}))[0]
    # Active-issue deletion accepts the snake_case query parameter and switches
    # to the requested surviving issue.
    c.patch(f"/api/rooms/{room_id}/active-issue", headers={"X-Host-Token":new_host}, json={"issueId":issue_c})
    out["delete_issue"] = result(c.delete(f"/api/rooms/{room_id}/issues/{issue_c}?next_active_issue_id={first_issue}", headers={"X-Host-Token":new_host}))[0]
    out["final_state"] = (result(c.get(f"/api/rooms/{code}", headers=P))[0],
                          [i["title"] for i in c.get(f"/api/rooms/{code}", headers=P).json()["issues"]],
                          len(c.get(f"/api/rooms/{code}", headers=P).json()["participants"]))
    out["final_normalized_state"] = normalized_state(c.get(f"/api/rooms/{code}", headers=P).json(), "Guest")
    out["websocket"] = asyncio.run(ws_check(base, room_id, guest_token, other["participantToken"], {"X-Host-Token":new_host}, code))
    # Test the same database after the server process is restarted.
    out["_restart"] = (code, guest_token)
    c.close()
    return out


def test_python_go_http_parity(tmp_path: Path, go_binary: Path) -> None:
    servers = [Server("python", tmp_path / "python.sqlite"), Server("go", tmp_path / "go.sqlite")]
    outcomes = {}
    try:
        for server in servers:
            server.start()
            outcome = scenario(server.base)
            server.stop()
            server.start()
            code, participant_token = outcome.pop("_restart")
            restored = httpx.get(server.base + f"/api/rooms/{code}",
                                  headers={"X-Participant-Token": participant_token}, trust_env=False)
            state = restored.json() if restored.status_code == 200 else {}
            outcome["restart_persistence"] = (restored.status_code,
                                               state.get("room", {}).get("name"),
                                               [i["title"] for i in state.get("issues", [])],
                                               len(state.get("participants", [])))
            outcomes[server.kind] = outcome
            assert outcome["websocket"] == (True, 201, '{"type":"room_updated"}', True, True), f"{server.kind} WebSocket behavior failed: {outcome['websocket']}"
            assert outcome["restart_persistence"][0] == 200, f"{server.kind} did not persist state across restart"
            server.stop()
        assert outcomes["python"] == outcomes["go"]
        expected = outcomes["python"]
        assert expected["spectator_vote"] == (403, "spectatorsCannotVote")
        assert expected["bool_coercion"] == (201, True)
        assert expected["imports"] == [("Imported A", "", "", "5", 2), ("Imported C", "desc", "", None, 4)]
        assert expected["empty_active_import"][-1] is True
        assert expected["cross_room"][-1] == (404, "participantNotFound")
        assert expected["websocket"][0] is True and expected["websocket"][1] == 201
        assert expected["websocket"][3:] == (True, True)
    finally:
        for server in servers:
            server.stop()


def test_go_opens_python_created_database(tmp_path: Path, go_binary: Path) -> None:
    """A Python-migrated SQLite database must remain readable by the Go API."""
    database = tmp_path / "python-created.sqlite"
    python = Server("python", database)
    go = Server("go", database)
    payload = {"roomName":"Cross-version", "participantName":"Owner", "defaults":{
        "facilitatorName":"Facilitator", "firstStoryTitle":"Persisted issue", "roomName":"Fallback"}}
    try:
        python.start()
        with httpx.Client(base_url=python.base, trust_env=False) as client:
            created = client.post("/api/rooms", json=payload).json()
            room = created["state"]["room"]
            joined = client.post(f"/api/rooms/{room['code']}/join", json={"name":"Persisted member", "isSpectator":False}).json()
            participant = joined["participant"]
            issue = created["state"]["issues"][0]
            vote = client.put(f"/api/rooms/{room['id']}/issues/{issue['id']}/votes/{participant['id']}",
                              headers={"X-Participant-Token":joined["participantToken"]}, json={"value":"13"})
            assert vote.status_code == 204
        python.stop()

        go.start()
        with httpx.Client(base_url=go.base, trust_env=False) as client:
            restored = client.get(f"/api/rooms/{room['code']}", headers={"X-Participant-Token":joined["participantToken"]})
            assert restored.status_code == 200, restored.text
            state = restored.json()
            assert state["room"]["id"] == room["id"]
            assert state["room"]["name"] == "Cross-version"
            assert [p["name"] for p in state["participants"]] == ["Owner", "Persisted member"]
            assert state["issues"][0]["title"] == "Persisted issue"
            assert [(v["value"], v["participant_id"], v["issue_id"]) for v in state["votes"]] == [
                ("13", participant["id"], issue["id"])
            ]
            # Go preserves the participant's token while keeping unrelated
            # participants' credentials secret, and still accepts Python's host token.
            assert next(p["token"] for p in state["participants"] if p["id"] == participant["id"]) == joined["participantToken"]
            host_view = client.get(f"/api/rooms/{room['code']}", headers={"X-Host-Token":created["hostToken"]}).json()
            assert host_view["room"]["host_token"] == created["hostToken"]
    finally:
        python.stop()
        go.stop()
