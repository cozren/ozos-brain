# backend/routers/knowledge.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..services import knowledge as svc

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


class StarRequest(BaseModel):
    path: str
    starred: bool


class OpenRequest(BaseModel):
    path: str


class ColorRequest(BaseModel):
    source_id: str
    color: str | None = None


class OrderRequest(BaseModel):
    order: list[str]


class FolderRequest(BaseModel):
    name: str
    parent: str


@router.get("/tree")
def get_tree():
    """Full source tree: registered sources with nested folder/markdown nodes."""
    return svc.build_tree()


@router.get("/file")
def get_file(path: str):
    """Raw markdown content + metadata for a document under a source root."""
    try:
        return svc.read_file(path)
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


@router.get("/asset")
def get_asset(path: str):
    """Serve an image referenced from markdown (jpg/png/gif/webp/svg)."""
    try:
        abs_path = svc.resolve_asset(path)
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)
    return FileResponse(abs_path)


@router.get("/search")
def search(q: str = ""):
    """Full-text search across the corpus; ranked results with snippets."""
    return svc.search(q)


@router.get("/graph")
def get_graph():
    """Trimmed node-link projection of the graphify knowledge graph."""
    return svc.load_graph()


@router.get("/stars")
def get_stars():
    """List the starred document paths."""
    return {"starred": svc.load_stars()}


@router.post("/open")
def record_open(req: OpenRequest):
    """Record that a document was opened; used to sort categories by frequency."""
    try:
        svc.record_open(req.path)
        return {"ok": True}
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


@router.post("/star")
def set_star(req: StarRequest):
    """Star or unstar a document; returns the updated star list."""
    try:
        return {"starred": svc.set_star(req.path, req.starred)}
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


@router.get("/colors")
def get_colors():
    """Map of source id → custom hex colour."""
    return {"colors": svc.load_colors()}


@router.post("/color")
def set_color(req: ColorRequest):
    """Set or clear a source's custom colour; returns the updated map."""
    try:
        return {"colors": svc.set_color(req.source_id, req.color)}
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


@router.get("/order")
def get_order():
    """The user's manual top-level card order (list of source ids)."""
    return {"order": svc.load_order()}


@router.post("/order")
def set_order(req: OrderRequest):
    """Persist the manual card order; returns the saved list."""
    try:
        return {"order": svc.set_order(req.order)}
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


@router.post("/folder")
def create_folder(req: FolderRequest):
    """Create a new folder under knowledge-hub/; returns its root-relative path."""
    try:
        return {"path": svc.create_folder(req.name, req.parent)}
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


class WriteRequest(BaseModel):
    path: str
    content: str


class MetaRequest(BaseModel):
    path: str
    tags: list[str] | None = None
    folders: list[str] | None = None
    links: list[dict] | None = None


class RenameRequest(BaseModel):
    path: str
    new_name: str


class MoveRequest(BaseModel):
    path: str
    dest_dir: str


@router.put("/file")
def put_file(req: WriteRequest):
    """Atomically write full markdown content to a document."""
    try:
        return svc.write_file(req.path, req.content)
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


@router.put("/meta")
def put_meta(req: MetaRequest):
    """Merge frontmatter fields (tags, folders, links) into a document."""
    try:
        return svc.update_meta(req.path, tags=req.tags, folders=req.folders, links=req.links)
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


@router.post("/rename")
def post_rename(req: RenameRequest):
    """Rename a document within its directory."""
    try:
        return svc.rename_file(req.path, req.new_name)
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


@router.post("/move")
def post_move(req: MoveRequest):
    """Move a document into another folder within the same source."""
    try:
        return svc.move_file(req.path, req.dest_dir)
    except svc.KnowledgeAccessError as e:
        raise HTTPException(e.status, e.detail)


@router.get("/tags")
def get_tags():
    """Sorted list of unique tags across all documents; used for autocomplete."""
    return {"tags": svc.all_tags()}
