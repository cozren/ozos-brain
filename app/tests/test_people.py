def test_list_people(client):
    response = client.get("/api/people")
    assert response.status_code == 200
    names = [p["name"] for p in response.json()]
    assert "alex" in names


def test_add_person(client):
    payload = {
        "name": "alex",
        "display_name": "Alex Chen",
        "role": "Product Manager",
        "start_date": "2026-01-01",
        "manager": "Taylor",
    }
    response = client.post("/api/people", json=payload)
    assert response.status_code == 200
    assert response.json()["name"] == "alex"


def test_add_person_creates_folder(client, tmp_data_dir):
    client.post(
        "/api/people",
        json={
            "name": "alex",
            "display_name": "Alex",
            "role": "PM",
            "start_date": "2026-01-01",
            "manager": "Taylor",
        },
    )
    assert (tmp_data_dir / "people" / "alex" / "meta.yaml").exists()


def test_get_cycle_data(client):
    response = client.get("/api/people/alex/cycles/2026-deep-dive")
    assert response.status_code == 200
    data = response.json()
    assert "manager_rating" in data
    assert "key_goals" in data
    assert "competencies" in data


def test_update_cycle_rating(client):
    payload = {"manager_rating": "exceeding-expectations"}
    response = client.put("/api/people/alex/cycles/2026-deep-dive", json=payload)
    assert response.status_code == 200
    check = client.get("/api/people/alex/cycles/2026-deep-dive")
    assert check.json()["manager_rating"] == "exceeding-expectations"


def test_update_cycle_goals_with_description(client):
    payload = {
        "key_goals": [
            {"title": "Goal A", "description": "ship the thing"},
            {"title": "Goal B", "description": ""},
        ]
    }
    client.put("/api/people/alex/cycles/2026-deep-dive", json=payload)
    check = client.get("/api/people/alex/cycles/2026-deep-dive")
    assert check.json()["key_goals"] == [
        {"title": "Goal A", "description": "ship the thing", "done": False},
        {"title": "Goal B", "description": "", "done": False},
    ]


def test_update_cycle_goals_coerces_legacy_strings(client):
    # Goals set before descriptions existed are bare strings; the API should
    # accept them and normalise to {title, description, done} objects.
    payload = {"key_goals": ["Goal A", "Goal B"]}
    client.put("/api/people/alex/cycles/2026-deep-dive", json=payload)
    check = client.get("/api/people/alex/cycles/2026-deep-dive")
    assert check.json()["key_goals"] == [
        {"title": "Goal A", "description": "", "done": False},
        {"title": "Goal B", "description": "", "done": False},
    ]


def test_update_cycle_goal_done_flag_persists(client):
    payload = {
        "key_goals": [
            {"title": "Goal A", "description": "done deal", "done": True},
        ]
    }
    client.put("/api/people/alex/cycles/2026-deep-dive", json=payload)
    check = client.get("/api/people/alex/cycles/2026-deep-dive")
    assert check.json()["key_goals"] == [
        {"title": "Goal A", "description": "done deal", "done": True},
    ]


def test_update_cycle_accomplishments_with_description(client):
    payload = {
        "key_accomplishments": [
            {"title": "Shipped X", "description": "drove 20% lift"},
        ]
    }
    client.put("/api/people/alex/cycles/2026-deep-dive", json=payload)
    check = client.get("/api/people/alex/cycles/2026-deep-dive")
    assert check.json()["key_accomplishments"] == [
        {"title": "Shipped X", "description": "drove 20% lift", "done": False},
    ]


def test_update_cycle_personal_notes(client):
    payload = {"personal_notes": "Remember to **delegate** more.\nFollow up next cycle."}
    client.put("/api/people/alex/cycles/2026-deep-dive", json=payload)
    check = client.get("/api/people/alex/cycles/2026-deep-dive")
    assert check.json()["personal_notes"] == "Remember to **delegate** more.\nFollow up next cycle."


def test_get_person_cycles_list(client):
    response = client.get("/api/people/alex/cycles")
    assert response.status_code == 200
    # Cycles now return metadata objects ({id, title, status}), not bare ids.
    assert "2026-deep-dive" in [c["id"] for c in response.json()]


def test_unknown_person_returns_404(client):
    response = client.get("/api/people/unknown/cycles/2026-deep-dive")
    assert response.status_code == 404
