from pathlib import Path

FIXTURE_TEXT = (Path(__file__).parent / "fixtures" / "sample_assessment.txt").read_text()


def test_returns_both_roles():
    from backend.services.pdf_ingest import parse_competencies_from_text

    result = parse_competencies_from_text(FIXTURE_TEXT)
    assert "self" in result and "manager" in result


def test_manager_has_13_keys():
    from backend.services.pdf_ingest import parse_competencies_from_text

    result = parse_competencies_from_text(FIXTURE_TEXT)
    assert len(result["manager"]) == 13


def test_manager_exceeding_expectations():
    from backend.services.pdf_ingest import parse_competencies_from_text

    result = parse_competencies_from_text(FIXTURE_TEXT)
    assert result["manager"]["business-operational-knowledge"] == "exceeding-expectations"


def test_manager_need_improvement():
    from backend.services.pdf_ingest import parse_competencies_from_text

    result = parse_competencies_from_text(FIXTURE_TEXT)
    assert result["manager"]["discovery"] == "need-improvement"


def test_self_differs_from_manager():
    from backend.services.pdf_ingest import parse_competencies_from_text

    result = parse_competencies_from_text(FIXTURE_TEXT)
    # Manager: Needs Improvement for user-knowledge; Self: Meeting Expectations
    assert result["manager"]["user-knowledge"] == "need-improvement"
    assert result["self"]["user-knowledge"] == "meeting-expectations"


def test_overall_self():
    from backend.services.pdf_ingest import parse_competencies_from_text

    result = parse_competencies_from_text(FIXTURE_TEXT)
    assert result["self"]["overall"] == "exceeding-expectations"


def test_overall_manager():
    from backend.services.pdf_ingest import parse_competencies_from_text

    result = parse_competencies_from_text(FIXTURE_TEXT)
    assert result["manager"]["overall"] == "meeting-expectations"
