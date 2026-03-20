from fastapi import APIRouter

from app.api.endpoints import jobs, results, websocket

api_router = APIRouter()

api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(results.router, prefix="/results", tags=["results"])
api_router.include_router(websocket.router, prefix="/ws", tags=["websocket"])
