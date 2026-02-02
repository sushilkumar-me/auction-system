from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, Boolean, Index
from sqlalchemy.orm import relationship, declarative_base  # Added declarative_base here
from datetime import datetime
import enum

Base = declarative_base()

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"

class PlayerStatus(str, enum.Enum):
    UNSOLD = "unsold"
    SOLD = "sold"

class PlayerRole(str, enum.Enum):
    BAT = "BAT"
    BWL = "BWL"
    AR = "AR" 
    WK = "WK"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String)
    role = Column(Enum(UserRole), default=UserRole.USER)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    projects = relationship("Project", back_populates="owner")

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"))
    total_teams = Column(Integer, default=10)
    own_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    status = Column(String, default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    owner = relationship("User", back_populates="projects")
    teams = relationship("Team", back_populates="project", foreign_keys="Team.project_id")
    players = relationship("Player", back_populates="project")
    auctions = relationship("Auction", back_populates="project")
    own_team = relationship("Team", foreign_keys=[own_team_id])

class Team(Base):
    __tablename__ = "teams"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String, nullable=False)
    initial_budget = Column(Float, default=10000000.0)
    remaining_budget = Column(Float, default=10000000.0)
    players_count = Column(Integer, default=0)
    color = Column(String, default="#3B82F6")
    
    project = relationship("Project", back_populates="teams", foreign_keys=[project_id])
    players = relationship("Player", back_populates="current_team")
    auctions = relationship("Auction", back_populates="team")

class Player(Base):
    __tablename__ = "players"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String, nullable=False)
    base_price = Column(Float, default=0.0)
    category = Column(String)
    role = Column(Enum(PlayerRole), nullable=True)
    points = Column(Integer, nullable=True)
    status = Column(Enum(PlayerStatus), default=PlayerStatus.UNSOLD)
    current_team_id = Column(Integer, ForeignKey("teams.id"), nullable=True)
    sold_price = Column(Float, nullable=True)
    sold_at = Column(DateTime, nullable=True)
    
    project = relationship("Project", back_populates="players")
    current_team = relationship("Team", back_populates="players")
    auction = relationship("Auction", back_populates="player", uselist=False)
    
    __table_args__ = (
        Index('idx_project_status', 'project_id', 'status'),
    )

class Auction(Base):
    __tablename__ = "auctions"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    player_id = Column(Integer, ForeignKey("players.id"))  # Removed unique=True
    team_id = Column(Integer, ForeignKey("teams.id"))
    price = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    is_reverted = Column(Boolean, default=False)
    
    project = relationship("Project", back_populates="auctions")
    player = relationship("Player", back_populates="auction")
    team = relationship("Team", back_populates="auctions")

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    action = Column(String)
    details = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"))