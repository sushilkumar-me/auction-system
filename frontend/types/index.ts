export interface User {
  id: number;
  email: string;
  full_name?: string;
}

export interface Team {
  id: number;
  name: string;
  initial_budget: number;
  remaining_budget: number;
  players_count: number;
  color: string;
}

export interface Player {
  id: number;
  name: string;
  base_price: number;
  category?: string;  // Platinum, Gold, Silver
  role?: 'BAT' | 'BWL' | 'AR' | 'WK';
  points?: number;
  status: 'unsold' | 'sold';
  current_team_id?: number;
  sold_price?: number;
}

export interface Auction {
  id: number;
  price: number;
  timestamp: string;
  player: Player;
  team: Team;
}

export interface Project {
  id: number;
  name: string;
  total_teams: number;
  own_team_id?: number;
  status: string;
  created_at: string;
}