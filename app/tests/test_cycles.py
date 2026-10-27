def test_get_cycles_returns_all_cycles(client):
    response = client.get("/api/cycles")
    assert response.status_code == 200
    data = response.json()
    assert "active_cycle" in data
    assert "2026-deep-dive" in data["cycles"]


def test_get_cycles_includes_events(client):
    response = client.get("/api/cycles")
    events = response.json()["cycles"]["2026-deep-dive"]["events"]
    ids = [e["id"] for e in events]
    assert "self-assessment" in ids


def test_update_event_dates(client):
    payload = {"start": "2026-04-10", "end": "2026-04-26"}
    response = client.put("/api/cycles/2026-deep-dive/events/self-assessment", json=payload)
    assert response.status_code == 200
    assert response.json()["start"] == "2026-04-10"


def test_update_event_persists(client):
    client.put(
        "/api/cycles/2026-deep-dive/events/self-assessment",
        json={"start": "2026-04-11", "end": "2026-04-27"},
    )
    response = client.get("/api/cycles")
    events = response.json()["cycles"]["2026-deep-dive"]["events"]
    sa = next(e for e in events if e["id"] == "self-assessment")
    assert sa["start"] == "2026-04-11"


def test_update_unknown_cycle_returns_404(client):
    response = client.put(
        "/api/cycles/nonexistent/events/self-assessment",
        json={"start": "2026-01-01", "end": "2026-01-02"},
    )
    assert response.status_code == 404


def test_update_unknown_event_returns_404(client):
    response = client.put(
        "/api/cycles/2026-deep-dive/events/nonexistent",
        json={"start": "2026-01-01", "end": "2026-01-02"},
    )
    assert response.status_code == 404


def test_create_global_cycle_seeds_deep_dive_template(client):
    r = client.post("/api/cycles", json={"name": "Deep Dive 2027", "type": "deep-dive"})
    assert r.status_code == 200
    data = r.json()
    assert "deep-dive-2027" in data["cycles"]
    events = data["cycles"]["deep-dive-2027"]["events"]
    ids = [e["id"] for e in events]
    assert "self-assessment" in ids
    assert "salary-promotions" in ids
    # milestones seeded with blank dates — the user sets them via the calendar picker
    assert all(e["start"] == "" and e["end"] == "" for e in events)


def test_create_global_cycle_light_touch_has_single_event(client):
    r = client.post("/api/cycles", json={"name": "Light Touch H1", "type": "light-touch"})
    assert r.status_code == 200
    events = r.json()["cycles"]["light-touch-h1"]["events"]
    assert [e["id"] for e in events] == ["manager-conversation"]


def test_create_global_cycle_dedupes_slug(client):
    first = client.post("/api/cycles", json={"name": "Deep Dive 2026", "type": "deep-dive"}).json()
    # "2026-deep-dive" already exists in the fixture under a different id, but the
    # slug "deep-dive-2026" is new; create a clash to force the -2 suffix
    second = client.post("/api/cycles", json={"name": "Deep Dive 2026", "type": "deep-dive"}).json()
    assert "deep-dive-2026" in first["cycles"]
    assert "deep-dive-2026-2" in second["cycles"]


def test_delete_global_cycle_removes_definition_and_person_folders(client, tmp_data_dir):
    folder = tmp_data_dir / "people" / "alex" / "cycles" / "2026-deep-dive"
    assert folder.exists()
    r = client.delete("/api/cycles/2026-deep-dive")
    assert r.status_code == 200
    assert "2026-deep-dive" not in r.json()["cycles"]
    assert not folder.exists()


def test_delete_active_global_cycle_repoints_active(client):
    r = client.delete("/api/cycles/2026-deep-dive")
    assert r.status_code == 200
    assert r.json()["active_cycle"] == "2026-light-touch"


def test_delete_last_remaining_cycle_refused(client):
    client.delete("/api/cycles/2026-deep-dive")  # leaves only light-touch
    r = client.delete("/api/cycles/2026-light-touch")
    assert r.status_code == 400


def test_delete_unknown_global_cycle_404(client):
    r = client.delete("/api/cycles/does-not-exist")
    assert r.status_code == 404
