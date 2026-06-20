from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.database import init_db
from backend.app.main import create_app


def make_client(tmp_path: Path) -> TestClient:
    db_path = tmp_path / "test.sqlite3"
    app = create_app(database_url=f"sqlite+pysqlite:///{db_path}")
    init_db()
    return TestClient(app)


def create_room(client: TestClient, room_name: str) -> dict:
    response = client.post(
        "/api/rooms",
        json={
            "roomName": room_name,
            "participantName": "Host",
            "defaults": {
                "facilitatorName": "Facilitator",
                "firstStoryTitle": "First story",
                "roomName": "Planning",
            },
        },
    )
    assert response.status_code == 201
    return response.json()


def test_room_state_requires_room_membership(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    room = create_room(client, "Private room")
    code = room["state"]["room"]["code"]

    anonymous = client.get(f"/api/rooms/{code}")
    assert anonymous.status_code == 403

    member = client.get(f"/api/rooms/{code}", headers={"X-Participant-Token": room["participantToken"]})
    assert member.status_code == 200
    assert member.json()["issues"][0]["title"] == "First story"


def test_participant_from_another_room_cannot_read_issues(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    first = create_room(client, "First")
    second = create_room(client, "Second")
    first_code = first["state"]["room"]["code"]

    response = client.get(f"/api/rooms/{first_code}", headers={"X-Participant-Token": second["participantToken"]})
    assert response.status_code == 403


def test_host_actions_require_matching_host_token(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    first = create_room(client, "First")
    second = create_room(client, "Second")
    first_room_id = first["state"]["room"]["id"]

    denied = client.post(
        f"/api/rooms/{first_room_id}/issues",
        headers={"X-Host-Token": second["hostToken"]},
        json={"title": "Secret issue", "description": "", "link": ""},
    )
    assert denied.status_code == 403

    allowed = client.post(
        f"/api/rooms/{first_room_id}/issues",
        headers={"X-Host-Token": first["hostToken"]},
        json={"title": "Visible issue", "description": "", "link": ""},
    )
    assert allowed.status_code == 201
