import pytest
import shutil
import sys
from pathlib import Path

# Add the parent of backend/ to sys.path so we can do: from backend.services import data
BACKEND_PARENT = Path(__file__).parent.parent
if str(BACKEND_PARENT) not in sys.path:
    sys.path.insert(0, str(BACKEND_PARENT))

FIXTURE_DATA = Path(__file__).parent / "fixtures"


@pytest.fixture
def tmp_data_dir(tmp_path, monkeypatch):
    data_dir = tmp_path / "people-hub"
    shutil.copytree(FIXTURE_DATA / "people-hub", data_dir)
    from backend.services import data as data_svc

    monkeypatch.setattr(data_svc, "DATA_DIR", data_dir)
    return data_dir


@pytest.fixture
def client(tmp_data_dir):
    from backend.main import app
    from fastapi.testclient import TestClient

    return TestClient(app)
