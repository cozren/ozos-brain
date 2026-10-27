# backend/tests/test_datahub.py
import json

from fastapi.testclient import TestClient

from backend.main import app
from backend.services import datahub as svc

client = TestClient(app)

BASE = "/api/datahub"


def test_default_layout_has_no_tabs(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    assert svc.get_layout() == {"tabs": {}, "pickerFolders": {}}


def test_layout_with_empty_tabs_roundtrips(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    (tmp_path / "datahub.json").write_text('{"tabs": {}}')
    assert svc.get_layout() == {"tabs": {}, "pickerFolders": {}}


def test_get_layout_endpoint_returns_empty_default(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    assert client.get(f"{BASE}/layout").json() == {"tabs": {}, "pickerFolders": {}}


def test_save_then_get_roundtrips(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    layout = {
        "tabs": {
            "media-ads": {
                "rows": [
                    {
                        "id": "row-1",
                        "tiles": [
                            {"i": "t1", "refId": "rev", "w": 6, "h": 10},
                            {"i": "t2", "refId": None, "w": 6, "h": 10},
                        ],
                    }
                ]
            },
            "widget": {"rows": []},
            "other": {"rows": []},
        }
    }
    r = client.put(f"{BASE}/layout", json=layout)
    assert r.status_code == 200
    got = client.get(f"{BASE}/layout").json()
    tiles = got["tabs"]["media-ads"]["rows"][0]["tiles"]
    assert tiles[0]["refId"] == "rev"
    assert tiles[1]["refId"] is None
    assert all("x" not in t and "y" not in t for t in tiles)


def test_save_keeps_empty_tile_with_null_ref(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    layout = {
        "tabs": {
            "media-ads": {
                "rows": [{"id": "row-1", "tiles": [{"i": "t1", "refId": None, "w": 12, "h": 10}]}]
            }
        }
    }
    client.put(f"{BASE}/layout", json=layout)
    got = client.get(f"{BASE}/layout").json()
    assert got["tabs"]["media-ads"]["rows"][0]["tiles"][0]["refId"] is None


def test_save_drops_malformed_tiles(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    layout = {
        "tabs": {
            "media-ads": {
                "rows": [
                    {
                        "id": "row-1",
                        "tiles": [
                            {"i": "ok", "refId": "rev", "w": 6, "h": 10},
                            {"i": "bad", "refId": "rev", "w": "NaN", "h": 10},
                            {"refId": "rev", "w": 6, "h": 10},  # no i
                        ],
                    }
                ]
            }
        }
    }
    client.put(f"{BASE}/layout", json=layout)
    got = client.get(f"{BASE}/layout").json()
    ids = [t["i"] for t in got["tabs"]["media-ads"]["rows"][0]["tiles"]]
    assert ids == ["ok"]


def test_per_tab_isolation(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    layout = {
        "tabs": {
            "media-ads": {
                "rows": [{"id": "row-1", "tiles": [{"i": "a", "refId": "x", "w": 12, "h": 8}]}]
            },
            "widget": {"rows": []},
        }
    }
    client.put(f"{BASE}/layout", json=layout)
    got = client.get(f"{BASE}/layout").json()
    assert len(got["tabs"]["media-ads"]["rows"][0]["tiles"]) == 1
    assert got["tabs"]["widget"]["rows"] == []


def test_malformed_json_file_falls_back_to_default(tmp_path, monkeypatch):
    f = tmp_path / "datahub.json"
    f.write_text("{not json", encoding="utf-8")
    monkeypatch.setattr(svc, "LAYOUT_FILE", f)
    assert client.get(f"{BASE}/layout").json() == {"tabs": {}, "pickerFolders": {}}


def test_get_layout_migrates_old_per_tab_tiles_into_rows(tmp_path, monkeypatch):
    """OLD per-tab {tiles:[{i,dashboardId,x,y,w,h}]} groups into rows by y,
    orders within a row by x, renames dashboardId->refId, drops x/y."""
    f = tmp_path / "datahub.json"
    f.write_text(
        json.dumps(
            {
                "tabs": {
                    "media-ads": {
                        "tiles": [
                            # y=0 row, given out of x order
                            {"i": "b", "dashboardId": "rev", "x": 6, "y": 0, "w": 6, "h": 10},
                            {"i": "a", "dashboardId": "clicks", "x": 0, "y": 0, "w": 6, "h": 10},
                            # y=10 row
                            {"i": "c", "dashboardId": None, "x": 0, "y": 10, "w": 12, "h": 8},
                        ]
                    },
                    "widget": {"tiles": []},
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(svc, "LAYOUT_FILE", f)
    got = client.get(f"{BASE}/layout").json()
    rows = got["tabs"]["media-ads"]["rows"]
    assert len(rows) == 2
    assert rows[0]["id"] == "row-1"
    assert rows[1]["id"] == "row-2"
    # row-1 (y=0): ordered by ascending x -> a then b
    assert [t["i"] for t in rows[0]["tiles"]] == ["a", "b"]
    assert rows[0]["tiles"][0]["refId"] == "clicks"
    assert rows[0]["tiles"][1]["refId"] == "rev"
    # row-2 (y=10): the null-ref tile
    assert rows[1]["tiles"][0]["refId"] is None
    # no x/y/dashboardId anywhere
    for row in rows:
        for t in row["tiles"]:
            assert set(t.keys()) == {"i", "refId", "w", "h"}
    # tab with no tiles -> rows: []
    assert got["tabs"]["widget"]["rows"] == []


def test_get_layout_empty_tab_old_shape_becomes_empty_rows(tmp_path, monkeypatch):
    f = tmp_path / "datahub.json"
    f.write_text(json.dumps({"tabs": {"media-ads": {"tiles": []}}}), encoding="utf-8")
    monkeypatch.setattr(svc, "LAYOUT_FILE", f)
    got = client.get(f"{BASE}/layout").json()
    assert got["tabs"]["media-ads"] == {"rows": []}


def test_save_then_get_layout_preserves_row_alignment(tmp_path, monkeypatch):
    """A row's `align` (left/center/right) survives the save→get round-trip."""
    f = tmp_path / "datahub.json"
    monkeypatch.setattr(svc, "LAYOUT_FILE", f)
    payload = {
        "tabs": {
            "media-ads": {
                "rows": [
                    {
                        "id": "row-1",
                        "align": "left",
                        "tiles": [{"i": "t1", "refId": "rev", "w": 6, "h": 10}],
                    },
                    {
                        "id": "row-2",
                        "align": "right",
                        "tiles": [{"i": "t2", "refId": "amz", "w": 6, "h": 10}],
                    },
                ]
            }
        }
    }
    client.put(f"{BASE}/layout", json=payload)
    rows = client.get(f"{BASE}/layout").json()["tabs"]["media-ads"]["rows"]
    assert rows[0]["align"] == "left"
    assert rows[1]["align"] == "right"


def test_save_layout_drops_invalid_row_alignment(tmp_path, monkeypatch):
    """A bogus align value is dropped (row falls back to the default center)."""
    f = tmp_path / "datahub.json"
    monkeypatch.setattr(svc, "LAYOUT_FILE", f)
    payload = {
        "tabs": {
            "media-ads": {
                "rows": [
                    {
                        "id": "row-1",
                        "align": "diagonal",
                        "tiles": [{"i": "t1", "refId": "rev", "w": 6, "h": 10}],
                    }
                ]
            }
        }
    }
    client.put(f"{BASE}/layout", json=payload)
    rows = client.get(f"{BASE}/layout").json()["tabs"]["media-ads"]["rows"]
    assert "align" not in rows[0]


def test_get_layout_already_new_shape_passthrough(tmp_path, monkeypatch):
    """A tab already in the new rows shape is passed through, not re-migrated."""
    f = tmp_path / "datahub.json"
    f.write_text(
        json.dumps(
            {
                "tabs": {
                    "media-ads": {
                        "rows": [
                            {
                                "id": "row-1",
                                "tiles": [{"i": "t1", "refId": "rev", "w": 6, "h": 10}],
                            }
                        ]
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(svc, "LAYOUT_FILE", f)
    got = client.get(f"{BASE}/layout").json()
    rows = got["tabs"]["media-ads"]["rows"]
    assert rows[0]["id"] == "row-1"
    assert rows[0]["tiles"][0] == {"i": "t1", "refId": "rev", "w": 6, "h": 10}


# ── pickerFolders: user-created sub-folders that organize the widget picker ────


def test_get_layout_default_has_empty_picker_folders(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    body = client.get(f"{BASE}/layout").json()
    assert body["pickerFolders"] == {}


def test_save_then_get_roundtrips_picker_folders(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    layout = {
        "tabs": {"media-ads": {"rows": []}},
        "pickerFolders": {
            "Widget": [
                {
                    "id": "f1",
                    "name": "Revenue",
                    "dashboardIds": ["widget-revenue-yoy", "amazon-revenue"],
                },
                {"id": "f2", "name": "Traffic", "dashboardIds": []},
            ]
        },
    }
    assert client.put(f"{BASE}/layout", json=layout).status_code == 200
    got = client.get(f"{BASE}/layout").json()
    folders = got["pickerFolders"]["Widget"]
    assert folders[0] == {
        "id": "f1",
        "name": "Revenue",
        "dashboardIds": ["widget-revenue-yoy", "amazon-revenue"],
    }
    assert folders[1] == {"id": "f2", "name": "Traffic", "dashboardIds": []}


def test_save_drops_malformed_picker_folders(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    layout = {
        "tabs": {"media-ads": {"rows": []}},
        "pickerFolders": {
            "Widget": [
                {
                    "id": "f1",
                    "name": "Revenue",
                    "dashboardIds": ["c1", 5, None],
                },  # non-str ids dropped
                {"name": "no id"},  # missing id -> whole folder dropped
                "junk",  # non-dict -> dropped
            ],
            "Bad": "not a list",  # non-list category -> dropped
        },
    }
    assert client.put(f"{BASE}/layout", json=layout).status_code == 200
    folders = client.get(f"{BASE}/layout").json()["pickerFolders"]
    assert list(folders.keys()) == ["Widget"]
    assert folders["Widget"] == [{"id": "f1", "name": "Revenue", "dashboardIds": ["c1"]}]


def test_save_layout_without_picker_folders_key_is_tolerated(tmp_path, monkeypatch):
    monkeypatch.setattr(svc, "LAYOUT_FILE", tmp_path / "datahub.json")
    assert (
        client.put(f"{BASE}/layout", json={"tabs": {"media-ads": {"rows": []}}}).status_code == 200
    )
    assert client.get(f"{BASE}/layout").json()["pickerFolders"] == {}
