from typing import Dict, Set
from fastapi import WebSocket
import asyncio

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, Set[WebSocket]] = {}
        self.lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket, project_id: int):
        await websocket.accept()
        async with self.lock:
            if project_id not in self.active_connections:
                self.active_connections[project_id] = set()
            self.active_connections[project_id].add(websocket)
    
    async def disconnect(self, websocket: WebSocket, project_id: int):
        async with self.lock:
            if project_id in self.active_connections:
                self.active_connections[project_id].discard(websocket)
    
    async def broadcast_to_project(self, project_id: int, message: dict):
        if project_id not in self.active_connections:
            return
        
        disconnected = []
        for connection in self.active_connections[project_id]:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        async with self.lock:
            for conn in disconnected:
                self.active_connections[project_id].discard(conn)

manager = ConnectionManager()

async def notify_player_sold(project_id: int, data: dict):
    await manager.broadcast_to_project(project_id, {
        "type": "player_sold",
        "data": data
    })

async def notify_undo(project_id: int, auction_id: int):
    await manager.broadcast_to_project(project_id, {
        "type": "undo",
        "auction_id": auction_id
    })