import io


def test_upload_pdf_saves_to_originals(client, tmp_data_dir):
    fake_pdf = b"%PDF-1.4 fake content"
    response = client.post(
        "/api/people/alex/cycles/2026-deep-dive/documents",
        files={"file": ("test.pdf", io.BytesIO(fake_pdf), "application/pdf")},
        data={"label": "Test Doc"},
    )
    assert response.status_code == 200
    assert (
        tmp_data_dir / "people" / "alex" / "cycles" / "2026-deep-dive" / "originals" / "test.pdf"
    ).exists()


def test_upload_registers_in_summary(client, tmp_data_dir):
    fake_pdf = b"%PDF-1.4 fake"
    client.post(
        "/api/people/alex/cycles/2026-deep-dive/documents",
        files={"file": ("test.pdf", io.BytesIO(fake_pdf), "application/pdf")},
        data={"label": "Test Doc"},
    )
    from backend.services.data import get_cycle_summary

    summary = get_cycle_summary("alex", "2026-deep-dive")
    files = [d["file"] for d in summary.get("documents", [])]
    assert any("test" in f for f in files)


def test_serve_markdown_document(client, tmp_data_dir):
    md_path = tmp_data_dir / "people" / "alex" / "cycles" / "2026-deep-dive" / "self-assessment.md"
    md_path.write_text("# Self Assessment\nSome content")
    response = client.get("/api/people/alex/cycles/2026-deep-dive/documents/self-assessment.md")
    assert response.status_code == 200
    assert "Self Assessment" in response.text


def test_serve_missing_document_returns_404(client):
    response = client.get("/api/people/alex/cycles/2026-deep-dive/documents/missing.md")
    assert response.status_code == 404
