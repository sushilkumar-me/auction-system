from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from app.models import PlayerRole, PlayerStatus

# User schemas
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    role: str
    is_active: bool
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

# Team schemas
class TeamBase(BaseModel):
    name: str
    initial_budget: float = 10000000.0

class TeamCreate(TeamBase):
    project_id: int

class Team(TeamBase):
    id: int
    project_id: int
    remaining_budget: float
    players_count: int
    color: str
    
    class Config:
        from_attributes = True

# Player schemas
class PlayerBase(BaseModel):
    name: str
    base_price: float = 0.0
    category: Optional[str] = None
    role: Optional[PlayerRole] = None
    points: Optional[int] = None

class PlayerCreate(PlayerBase):
    project_id: int

class Player(PlayerBase):
    id: int
    project_id: int
    status: PlayerStatus
    current_team_id: Optional[int] = None
    sold_price: Optional[float] = None
    
    class Config:
        from_attributes = True

# Auction schemas
class AuctionCreate(BaseModel):
    player_id: int
    team_id: int
    price: float

class Auction(BaseModel):
    id: int
    project_id: int
    player_id: int
    team_id: int
    price: float
    timestamp: datetime
    is_reverted: bool
    
    class Config:
        from_attributes = True

class AuctionResponse(BaseModel):
    id: int
    price: float
    timestamp: datetime
    player: Player
    team: Team
    
    class Config:
        from_attributes = True

# Project schemas
class ProjectBase(BaseModel):
    name: str
    total_teams: int = 10

class ProjectCreate(ProjectBase):
    pass

class Project(ProjectBase):
    id: int
    owner_id: int
    own_team_id: Optional[int] = None
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ProjectDetail(Project):
    teams: List[Team]
    players_count: int = 0

# Live auction data
class LiveAuctionData(BaseModel):
    teams: List[Team]
    unsold_players: List[Player]
    recent_sales: List[AuctionResponse]