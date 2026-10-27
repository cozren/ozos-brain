from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_unknown_data_endpoint_is_404():
    """Company-specific data endpoints were removed; only the layout API remains."""
    assert client.get("/api/datahub/gam-forecast").status_code == 404
    assert client.get("/api/datahub/layout").status_code == 200
