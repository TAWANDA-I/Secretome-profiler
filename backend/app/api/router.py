from fastapi import APIRouter

from app.api.endpoints import auth, conversations, jobs, results, websocket

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
api_router.include_router(results.router, prefix="/results", tags=["results"])
api_router.include_router(websocket.router, prefix="/ws", tags=["websocket"])
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])
