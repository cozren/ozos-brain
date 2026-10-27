from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import PlainTextResponse
from datetime import date
from ..services import data as svc
from ..services.pdf_ingest import ingest_pdf

router = APIRouter(prefix="/people", tags=["documents"])


@router.post("/{person_id}/cycles/{cycle_id}/documents")
async def upload_document(
    person_id: str,
    cycle_id: str,
    file: UploadFile = File(...),
    label: str = Form(...),
):
    if not svc.get_person_meta(person_id):
        raise HTTPException(404, f"Person '{person_id}' not found")
    content = await file.read()
    pdf_path = svc.save_document(person_id, cycle_id, file.filename, content)

    is_pdf = file.filename.lower().endswith(".pdf")
    if is_pdf:
        try:
            ingest_pdf(pdf_path, person_id, cycle_id, label)
        except Exception as e:
            pass  # ingestion failure shouldn't block registration

    md_filename = file.filename.replace(".pdf", ".md") if is_pdf else file.filename
    entry = {
        "file": md_filename,
        "label": label,
        "source_pdf": f"originals/{file.filename}",
        "ingested_at": str(date.today()),
    }
    svc.register_document(person_id, cycle_id, entry)
    return entry


@router.post("/{person_id}/cycles/{cycle_id}/reingest")
async def reingest_all_documents(person_id: str, cycle_id: str):
    """Re-run ingestion on all registered PDFs for this cycle."""
    if not svc.get_person_meta(person_id):
        raise HTTPException(404, f"Person '{person_id}' not found")
    summary = svc.get_cycle_summary(person_id, cycle_id) or {}
    docs = summary.get("documents", [])
    results = []
    for doc in docs:
        source_pdf = doc.get("source_pdf", "")
        if not source_pdf:
            continue
        pdf_path = svc.get_cycle_dir(person_id, cycle_id) / source_pdf
        if not pdf_path.exists():
            results.append({"file": doc.get("file"), "status": "pdf_not_found"})
            continue
        try:
            competencies = ingest_pdf(
                pdf_path, person_id, cycle_id, doc.get("label", doc.get("file", ""))
            )
            results.append({"file": doc.get("file"), "status": "ok", "competencies": competencies})
        except Exception as e:
            results.append({"file": doc.get("file"), "status": "error", "detail": str(e)})
    return {"results": results}


@router.delete("/{person_id}/cycles/{cycle_id}/documents/{filename}")
def delete_document(person_id: str, cycle_id: str, filename: str):
    if not svc.get_person_meta(person_id):
        raise HTTPException(404, f"Person '{person_id}' not found")
    svc.delete_document(person_id, cycle_id, filename)

    # re-ingest remaining PDFs to rebuild competencies
    summary = svc.get_cycle_summary(person_id, cycle_id) or {}
    for doc in summary.get("documents", []):
        source_pdf = doc.get("source_pdf", "")
        if not source_pdf:
            continue
        pdf_path = svc.get_cycle_dir(person_id, cycle_id) / source_pdf
        if pdf_path.exists():
            try:
                ingest_pdf(pdf_path, person_id, cycle_id, doc.get("label", doc.get("file", "")))
            except Exception:
                pass

    return svc.get_cycle_summary(person_id, cycle_id) or {}


@router.get("/{person_id}/cycles/{cycle_id}/documents/{filename}")
def serve_document(person_id: str, cycle_id: str, filename: str):
    path = svc.get_document_path(person_id, cycle_id, filename)
    if not path:
        raise HTTPException(404, "Document not found")
    return PlainTextResponse(path.read_text(encoding="utf-8", errors="replace"))
