from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import (
    cycles,
    people,
    documents,
    chat,
    control_tower,
    tasks,
    knowledge,
    reporting,
    datahub,
    intel_agents,
    me,
    setup,
    goals,
    datapoints,
)

app = FastAPI(title="OZOS Brain")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cycles.router, prefix="/api")
app.include_router(people.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(control_tower.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(knowledge.router, prefix="/api")
app.include_router(reporting.router, prefix="/api")
app.include_router(datahub.router, prefix="/api")
app.include_router(intel_agents.router, prefix="/api")
app.include_router(me.router, prefix="/api")
app.include_router(setup.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(datapoints.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
