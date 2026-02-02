import pandas as pd
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select  # ADD THIS IMPORT
from io import BytesIO

from app.database import get_db
from app.models import Player, Project, User
from app.auth import get_current_active_user

router = APIRouter(prefix="/upload", tags=["upload"])

@router.post("/players/{project_id}")
async def upload_players(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Verify project access
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(400, "Only Excel files allowed")
    
    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents))
        
        # Normalize column names
        df.columns = [col.lower().strip().replace(' ', '_') for col in df.columns]
        
        # Map common variations
        column_mapping = {
            'player_name': 'name',
            'player': 'name',
            'base_price': 'base_price',
            'price': 'base_price',
            'category': 'category',
            'role': 'role',
            'points': 'points'
        }
        
        df = df.rename(columns=column_mapping)
        
        if 'name' not in df.columns:
            raise HTTPException(400, f"Required column 'name' not found. Columns: {df.columns.tolist()}")
        
        players_added = 0
        for _, row in df.iterrows():
            player = Player(
                project_id=project_id,
                name=str(row.get('name', '')),
                base_price=float(row.get('base_price', 0)) if pd.notna(row.get('base_price')) else 0,
                category=str(row.get('category', '')) if pd.notna(row.get('category')) else None,
                role=str(row.get('role', '')).upper() if pd.notna(row.get('role')) else None,
                points=int(row.get('points')) if pd.notna(row.get('points')) else None
            )
            db.add(player)
            players_added += 1
        
        await db.commit()
        return {"message": f"Successfully uploaded {players_added} players"}
        
    except Exception as e:
        raise HTTPException(500, f"Error processing file: {str(e)}")