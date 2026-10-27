def test_read_cycles(tmp_data_dir):
    from backend.services import data as svc

    cycles = svc.read_cycles()
    assert "active_cycle" in cycles
    assert "2026-deep-dive" in cycles["cycles"]


def test_list_people(tmp_data_dir):
    from backend.services import data as svc

    people = svc.list_people()
    names = [p["name"] for p in people]
    assert "alex" in names


def test_create_person(tmp_data_dir):
    from backend.services import data as svc

    svc.create_person(
        "alex",
        {
            "name": "alex",
            "display_name": "Alex",
            "role": "PM",
            "start_date": "2026-01-01",
            "manager": "Taylor",
        },
    )
    assert (tmp_data_dir / "people" / "alex" / "meta.yaml").exists()


def test_write_and_read_cycle_summary(tmp_data_dir):
    from backend.services import data as svc

    data = {"manager_rating": "meeting-expectations", "key_goals": ["goal1"]}
    svc.write_cycle_summary("alex", "2026-deep-dive", data)
    result = svc.get_cycle_summary("alex", "2026-deep-dive")
    assert result["manager_rating"] == "meeting-expectations"
