from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_okr_routes_are_gone():
    """The Atlas OKR path was removed; goals are rebuilt from setup in a later phase."""
    assert client.get("/api/okr/cascade").status_code == 404
