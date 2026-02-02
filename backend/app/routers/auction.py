from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime

from app.database import get_db
from app.models import Player, Team, Auction, Project, PlayerStatus, User
from app.schemas import AuctionCreate, AuctionResponse, Player as PlayerSchema, Team as TeamSchema
from app.auth import get_current_user, get_current_active_user
from app.websocket import manager, notify_player_sold, notify_undo

router = APIRouter(prefix="/auction", tags=["auction"])

@router.post("/sell")
async def sell_player(
    auction_data: AuctionCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_active_user)
):
    async with db.begin_nested():
        # Lock player row
        result = await db.execute(
            select(Player)
            .where(Player.id == auction_data.player_id)
            .with_for_update()
        )
        player = result.scalar_one_or_none()
        
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
        
        if player.status == PlayerStatus.SOLD:
            raise HTTPException(status_code=400, detail="Player already sold")
        
        # Lock team row
        team_result = await db.execute(
            select(Team)
            .where(Team.id == auction_data.team_id)
            .with_for_update()
        )
        team = team_result.scalar_one_or_none()
        
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        
        if team.project_id != player.project_id:
            raise HTTPException(status_code=400, detail="Team and player not in same project")
        
        if team.remaining_budget < auction_data.price:
            raise HTTPException(
                status_code=400, 
                detail=f"Insufficient budget. Available: {team.remaining_budget}, Required: {auction_data.price}"
            )
        
        # Create auction record
        auction = Auction(
            project_id=player.project_id,
            player_id=player.id,
            team_id=team.id,
            price=auction_data.price
        )
        db.add(auction)
        await db.flush()  # Get auction.id but don't commit yet
        
        # Update player
        player.status = PlayerStatus.SOLD
        player.current_team_id = team.id
        player.sold_price = auction_data.price
        player.sold_at = datetime.utcnow()
        
        # Update team
        team.remaining_budget -= auction_data.price
        team.players_count += 1
        
        # Commit happens automatically when exiting context manager
    
    # Now transaction is committed, fetch fresh data for response
    result = await db.execute(
        select(Auction)
        .options(selectinload(Auction.player), selectinload(Auction.team))
        .where(Auction.id == auction.id)
    )
    auction = result.scalar_one()
    
    # Broadcast update
    await notify_player_sold(
        player.project_id,
        {
            "player": {
                "id": player.id,
                "name": player.name,
                "sold_price": player.sold_price,
                "category": player.category,
                "role": player.role,
                "points": player.points,
                "team_id": team.id,
                "team_name": team.name
            },
            "team": {
                "id": team.id,
                "remaining_budget": team.remaining_budget,
                "players_count": team.players_count
            },
            "auction_id": auction.id
        }
    )
    
    return {
        "success": True,
        "auction_id": auction.id,
        "player_name": player.name,
        "team_name": team.name,
        "price": auction.price
    }

@router.post("/undo/{auction_id}")
async def undo_auction(
    auction_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Auction)
        .options(selectinload(Auction.player), selectinload(Auction.team))
        .where(Auction.id == auction_id)
    )
    auction = result.scalar_one_or_none()
    
    if not auction or auction.is_reverted:
        raise HTTPException(status_code=404, detail="Auction not found or already reverted")
    
    # Verify project access
    project_result = await db.execute(
        select(Project).where(Project.id == auction.project_id, Project.owner_id == current_user.id)
    )
    if not project_result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not authorized")
    
    async with db.begin_nested():
        team_result = await db.execute(
            select(Team).where(Team.id == auction.team_id).with_for_update()
        )
        team = team_result.scalar_one()
        
        player_result = await db.execute(
            select(Player).where(Player.id == auction.player_id).with_for_update()
        )
        player = player_result.scalar_one()
        
        # Restore team
        team.remaining_budget += auction.price
        team.players_count -= 1
        
        # Restore player
        player.status = PlayerStatus.UNSOLD
        player.current_team_id = None
        player.sold_price = None
        player.sold_at = None
        
        auction.is_reverted = True
        
        await db.commit()
        
        await notify_undo(auction.project_id, auction_id)
        
        return {"message": "Auction undone successfully"}

@router.get("/live-data/{project_id}")
async def get_live_auction_data(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Verify access
    project_result = await db.execute(
        select(Project).where(Project.id == project_id, Project.owner_id == current_user.id)
    )
    if not project_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get teams
    teams_result = await db.execute(
        select(Team).where(Team.project_id == project_id)
    )
    teams = teams_result.scalars().all()
    
    # Get unsold players
    players_result = await db.execute(
        select(Player)
        .where(
            and_(Player.project_id == project_id, 
                 Player.status == PlayerStatus.UNSOLD)
        )
        .order_by(Player.category.desc(), Player.points.desc())
    )
    unsold_players = players_result.scalars().all()
    
    # Get recent auctions
    auctions_result = await db.execute(
        select(Auction)
        .options(selectinload(Auction.player), selectinload(Auction.team))
        .where(
            and_(Auction.project_id == project_id,
                 Auction.is_reverted == False)
        )
        .order_by(Auction.timestamp.desc())
        .limit(50)
    )
    recent_auctions = auctions_result.scalars().all()
    
    return {
        "teams": teams,
        "unsold_players": unsold_players,
        "recent_sales": recent_auctions
    }

@router.websocket("/ws/{project_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    project_id: int,
    token: str
):
    # Verify token
    from app.database import async_session
    from app.auth import get_current_user
    
    async with async_session() as db:
        try:
            user = await get_current_user(token, db)
        except:
            await websocket.close(code=4001)
            return
    
    await manager.connect(websocket, project_id)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({"type": "ping", "timestamp": datetime.utcnow().isoformat()})
    except WebSocketDisconnect:
        await manager.disconnect(websocket, project_id)