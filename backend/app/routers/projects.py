from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List
from sqlalchemy import select, delete, update

from app.database import get_db
from app.models import Project, Team, Player, Auction, User  # Added Auction here
from app.schemas import ProjectCreate, Project as ProjectSchema, ProjectDetail
from app.auth import get_current_active_user

router = APIRouter(prefix="/projects", tags=["projects"])

@router.post("/", response_model=ProjectSchema)
async def create_project(
    project: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    db_project = Project(
        name=project.name,
        total_teams=project.total_teams,
        owner_id=current_user.id
    )
    db.add(db_project)
    await db.commit()
    await db.refresh(db_project)
    return db_project

@router.get("/", response_model=List[ProjectSchema])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Project).where(Project.owner_id == current_user.id)
    )
    return result.scalars().all()

@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a project and all its data"""
    
    # Check project exists and belongs to user
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        # 1. Clear own_team_id reference first
        await db.execute(
            update(Project)
            .where(Project.id == project_id)
            .values(own_team_id=None)
        )
        
        # 2. Delete auctions
        await db.execute(
            delete(Auction).where(Auction.project_id == project_id)
        )
        
        # 3. Delete players
        await db.execute(
            delete(Player).where(Player.project_id == project_id)
        )
        
        # 4. Delete teams
        await db.execute(
            delete(Team).where(Team.project_id == project_id)
        )
        
        # 5. Delete project
        await db.execute(
            delete(Project).where(Project.id == project_id)
        )
        
        await db.commit()
        return {"message": "Project deleted successfully"}
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")

@router.patch("/{project_id}", response_model=ProjectSchema)
async def update_project(
    project_id: int,
    project_update: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    for key, value in project_update.items():
        setattr(project, key, value)
    
    await db.commit()
    await db.refresh(project)
    return project

@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Delete a project and all its data (teams, players, auctions)"""
    
    # Verify project exists and belongs to user
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Delete in correct order to avoid foreign key constraints
    # 1. Delete auctions
    await db.execute(
        delete(Auction).where(Auction.project_id == project_id)
    )
    
    # 2. Delete players
    await db.execute(
        delete(Player).where(Player.project_id == project_id)
    )
    
    # 3. Delete teams
    await db.execute(
        delete(Team).where(Team.project_id == project_id)
    )
    
    # 4. Delete project
    await db.execute(
        delete(Project).where(Project.id == project_id)
    )
    
    await db.commit()
    
    return {"message": "Project deleted successfully"}