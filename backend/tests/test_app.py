import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import app
from clock import fmt
from db import get_session
from models import Base

CREATE_BODY = {
    "roomName": "Sprint",
    "participantName": "Host",
    "defaults": {
        "roomName": "Planning",
        "facilitatorName": "Facilitator",
        "firstStoryTitle": "First story",
    },
}


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    def override():
        with Session(engine, expire_on_commit=False) as session:
            yield session

    app.dependency_overrides[get_session] = override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def create_room(client):
    response = client.post("/api/rooms", json=CREATE_BODY)
    assert response.status_code == 201, response.text
    return response.json()


def join_room(client, code, name="Guest", spectator=False):
    response = client.post(
        f"/api/rooms/{code}/join",
        json={"name": name, "isSpectator": spectator},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_create_join_and_load(client):
    created = create_room(client)
    code = created["state"]["room"]["code"]
    host_token = created["hostToken"]
    participant_token = created["participantToken"]
    assert created["state"]["room"]["host_token"] == host_token
    assert created["state"]["participants"][0]["token"] == participant_token

    joined = join_room(client, code, "Guest")
    assert joined["room"]["host_token"] == ""
    assert joined["participant"]["token"] == joined["participantToken"]

    hidden = client.get(
        f"/api/rooms/{code}",
        headers={"X-Participant-Token": joined["participantToken"]},
    )
    assert hidden.status_code == 200
    assert hidden.json()["room"]["host_token"] == ""

    revealed = client.get(f"/api/rooms/{code}", headers={"X-Host-Token": host_token})
    assert revealed.json()["room"]["host_token"] == host_token

    owner_view = client.get(
        f"/api/rooms/{code}", headers={"X-Participant-Token": participant_token}
    )
    assert owner_view.json()["room"]["host_token"] == host_token

    denied = client.get(f"/api/rooms/{code}")
    assert denied.status_code == 403
    assert denied.json() == {"detail": "roomAccessDenied"}


def test_vote_reveal_and_reset(client):
    created = create_room(client)
    code = created["state"]["room"]["code"]
    issue_id = created["state"]["room"]["active_issue_id"]
    host = {"X-Host-Token": created["hostToken"]}
    guest = join_room(client, code, "Guest")
    guest_headers = {"X-Participant-Token": guest["participantToken"]}

    vote = client.put(
        f"/api/rooms/{created['state']['room']['id']}/issues/{issue_id}/votes/{guest['participant']['id']}",
        json={"value": "8"},
        headers=guest_headers,
    )
    assert vote.status_code == 204

    state = client.get(f"/api/rooms/{code}", headers=guest_headers).json()
    assert state["votes"][0]["value"] == "8"

    assert (
        client.patch(
            f"/api/rooms/{created['state']['room']['id']}/reveal", headers=host
        ).status_code
        == 204
    )
    state = client.get(f"/api/rooms/{code}", headers=guest_headers).json()
    assert state["room"]["revealed"] is True

    assert (
        client.post(
            f"/api/rooms/{created['state']['room']['id']}/issues/{issue_id}/reset-votes",
            headers=host,
        ).status_code
        == 204
    )
    state = client.get(f"/api/rooms/{code}", headers=guest_headers).json()
    assert state["votes"] == []
    assert state["room"]["revealed"] is False


def test_spectator_cannot_vote_and_validation(client):
    created = create_room(client)
    code = created["state"]["room"]["code"]
    room_id = created["state"]["room"]["id"]
    issue_id = created["state"]["room"]["active_issue_id"]
    guest = join_room(client, code, "Observer", spectator=True)

    response = client.put(
        f"/api/rooms/{room_id}/issues/{issue_id}/votes/{guest['participant']['id']}",
        json={"value": "5"},
        headers={"X-Participant-Token": guest["participantToken"]},
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "spectatorsCannotVote"}

    invalid = client.post(f"/api/rooms/{code}/join", json={"name": "Guest"})
    assert invalid.status_code == 422
    assert isinstance(invalid.json()["detail"], str)

    coerced = client.post(
        f"/api/rooms/{code}/join",
        json={"name": "Guest", "isSpectator": "no"},
    )
    assert coerced.status_code == 422

    missing = client.get("/api/missing")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Not Found"}

    wrong_method = client.put("/api/health")
    assert wrong_method.status_code == 405
    assert wrong_method.json() == {"detail": "Method Not Allowed"}


def test_issue_crud_and_archive(client):
    created = create_room(client)
    room = created["state"]["room"]
    host = {"X-Host-Token": created["hostToken"]}

    response = client.post(
        f"/api/rooms/{room['id']}/issues",
        json={"title": "  Second  ", "description": None, "link": None},
        headers=host,
    )
    assert response.status_code == 201
    issue = response.json()
    assert issue["title"] == "Second"
    assert issue["position"] == 2

    assert (
        client.patch(
            f"/api/issues/{issue['id']}",
            json={"title": "Renamed", "description": "Desc", "link": "https://x"},
            headers=host,
        ).json()["title"]
        == "Renamed"
    )

    archived = client.patch(
        f"/api/rooms/{room['id']}/issues/{issue['id']}/archive",
        json={"nextActiveIssueId": None},
        headers=host,
    )
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None

    assert (
        client.patch(
            f"/api/rooms/{room['id']}/issues/{issue['id']}/unarchive",
            headers=host,
        ).json()["archived_at"]
        is None
    )

    deleted = client.delete(
        f"/api/rooms/{room['id']}/issues/{issue['id']}?next_active_issue_id=",
        headers=host,
    )
    assert deleted.status_code == 204

    empty = client.post(
        f"/api/rooms/{room['id']}/issues",
        json={"title": "   "},
        headers=host,
    )
    assert empty.status_code == 201
    assert empty.json() is None


def test_admin_import_export(client):
    create_room(client)
    client.app.state.ADMIN_TOKEN = "secret"
    admin = {"X-Admin-Token": "secret"}

    exported = client.get("/api/admin/export", headers=admin)
    assert exported.status_code == 200
    dump = exported.json()
    assert len(dump["rooms"]) == 1
    assert dump["rooms"][0]["revealed"] == 0

    imported = client.post("/api/admin/import", json=dump, headers=admin)
    assert imported.status_code == 200
    assert imported.json() == {
        "rooms": 1,
        "participants": 1,
        "issues": 1,
        "votes": 0,
    }

    invalid = client.post(
        "/api/admin/import",
        json={"rooms": [], "participants": [{"id": "p", "room_id": "missing"}]},
        headers=admin,
    )
    assert invalid.status_code == 400
    assert "unknown room" in invalid.json()["detail"]

    hidden = client.get("/api/admin/export")
    assert hidden.status_code == 403

    del client.app.state.ADMIN_TOKEN
    disabled = client.get("/api/admin/export", headers=admin)
    assert disabled.status_code == 404


def test_cors_and_trailing_slash(client):
    client.app.state.CORS_ORIGINS = "*"
    preflight = client.options(
        "/api/rooms",
        headers={"Origin": "https://example.com", "Access-Control-Request-Method": "POST"},
    )
    assert preflight.status_code == 204
    assert preflight.headers["access-control-allow-origin"] == "*"

    client.app.state.CORS_ORIGINS = "https://allowed.example"
    denied = client.options(
        "/api/rooms",
        headers={"Origin": "https://other.example", "Access-Control-Request-Method": "POST"},
    )
    assert denied.status_code == 403

    redirect = client.get("/api/health/", follow_redirects=False)
    assert redirect.status_code == 301
    assert redirect.headers["location"].endswith("/api/health")
    del client.app.state.CORS_ORIGINS


def test_timestamps():
    assert fmt("2026-11-23T13:04:05.123Z") == "2026-11-23T13:04:05.123Z"
    assert fmt("2026-11-23T13:04:05.000Z") == "2026-11-23T13:04:05Z"
    assert fmt(None) is None
    assert fmt("not a date") is None
