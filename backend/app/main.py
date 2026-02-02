from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from app.database import engine
from app.models import Base
from app.routers import auth, projects, teams, auction, upload

@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()

app = FastAPI(title="Auction Management System", lifespan=lifespan)

# Allow Railway and localhost
origins = [
    "http://localhost:3000",
    "https://localhost:3000",
    "https://*.up.railway.app",  # Railway domains
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(teams.router)
app.include_router(auction.router)
app.include_router(upload.router)

@app.get("/")
async def root():
    return {"message": "Auction API is running"}