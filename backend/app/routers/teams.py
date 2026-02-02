from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Team, Project, User
from app.schemas import TeamCreate, Team as TeamSchema
from app.auth import get_current_active_user

router = APIRouter(prefix="/teams", tags=["teams"])

@router.post("/", response_model=TeamSchema)
async def create_team(
    team: TeamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Verify project belongs to user
    result = await db.execute(
        select(Project).where(Project.id == team.project_id, Project.owner_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    db_team = Team(
        project_id=team.project_id,
        name=team.name,
        initial_budget=team.initial_budget,
        remaining_budget=team.initial_budget
    )
    db.add(db_team)
    await db.commit()
    await db.refresh(db_team)
    return db_team

@router.get("/project/{project_id}", response_model=list[TeamSchema])
async def get_project_teams(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Verify access
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    result = await db.execute(select(Team).where(Team.project_id == project_id))
    return result.scalars().all()