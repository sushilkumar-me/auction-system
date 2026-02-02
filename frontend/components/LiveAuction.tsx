'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Player, Team, Auction } from '@/types';
import { useAuctionSocket } from '@/hooks/useAuctionSocket';
import Link from 'next/link';

interface LiveAuctionProps {
  projectId: number;
}

export default function LiveAuction({ projectId }: LiveAuctionProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<number>(0);
  const [bidPrice, setBidPrice] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewingTeam, setViewingTeam] = useState<Team | null>(null);
  
  const queryClient = useQueryClient();
  const { isConnected } = useAuctionSocket(projectId);

  const { data: liveData, isLoading } = useQuery({
    queryKey: ['auction-data', projectId],
    queryFn: () => api.get(`/auction/live-data/${projectId}`).then(r => r.data),
    refetchInterval: !isConnected ? 5000 : false,
  });

  const sellMutation = useMutation({
    mutationFn: (data: { player_id: number; team_id: number; price: number }) =>
      api.post('/auction/sell', data),
    onSuccess: () => {
      setSelectedPlayer(null);
      setSelectedTeam(0);
      setBidPrice('');
      queryClient.invalidateQueries({ queryKey: ['auction-data', projectId] });
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ['auction-data', projectId] });
      if (error.response?.data?.detail) {
        alert(error.response.data.detail);
      }
    }
  });

  const undoMutation = useMutation({
    mutationFn: (auctionId: number) => api.post(`/auction/undo/${auctionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auction-data', projectId] });
    }
  });

  const handleSell = () => {
    if (!selectedPlayer || !selectedTeam || !bidPrice) return;
    
    const price = parseFloat(bidPrice);
    const team = liveData?.teams.find((t: Team) => t.id === selectedTeam);
    
    if (team && price > team.remaining_budget) {
      alert('Insufficient budget!');
      return;
    }

    sellMutation.mutate({
      player_id: selectedPlayer.id,
      team_id: selectedTeam,
      price: price
    });
  };

  // Get team players from recent sales
  const getTeamPlayers = (teamId: number) => {
    return liveData?.recent_sales?.filter((a: Auction) => a.team.id === teamId) || [];
  };

  // Calculate team stats
  const getTeamStats = (teamId: number) => {
    const teamAuctions = getTeamPlayers(teamId);
    const totalSpent = teamAuctions.reduce((sum: number, a: Auction) => sum + a.price, 0);
    const playerCount = teamAuctions.length;
    const avgPrice = playerCount > 0 ? totalSpent / playerCount : 0;
    
    const categories = {
      platinum: teamAuctions.filter((a: Auction) => a.player.category?.toLowerCase() === 'platinum').length,
      gold: teamAuctions.filter((a: Auction) => a.player.category?.toLowerCase() === 'gold').length,
      silver: teamAuctions.filter((a: Auction) => a.player.category?.toLowerCase() === 'silver').length,
    };

    return { totalSpent, playerCount, avgPrice, categories };
  };

  const getCategoryColor = (category?: string) => {
    switch (category?.toLowerCase()) {
      case 'platinum': return 'text-purple-400';
      case 'gold': return 'text-yellow-400';
      case 'silver': return 'text-gray-400';
      default: return 'text-white';
    }
  };

  const getCategoryBadge = (category?: string) => {
    const colors = {
      platinum: 'bg-purple-600',
      gold: 'bg-yellow-600',
      silver: 'bg-gray-600'
    };
    return colors[category?.toLowerCase() as keyof typeof colors] || 'bg-blue-600';
  };

  if (isLoading) return <div className="p-8 text-white">Loading...</div>;

  const { teams, unsold_players, recent_sales } = liveData || {};
  const filteredPlayers = unsold_players?.filter((p: Player) => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="flex justify-between items-center mb-4">
        <Link href="/" className="text-blue-400 hover:underline">← Back to Dashboard</Link>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm">{isConnected ? 'Live' : 'Disconnected'}</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Team Budget Board */}
        <div className="col-span-3 bg-gray-800 rounded-lg p-4 overflow-auto h-[calc(100vh-100px)]">
          <h2 className="text-xl font-bold mb-4">Team Budgets (Click to View)</h2>
          <div className="space-y-3">
            {teams?.map((team: Team) => (
              <div 
                key={team.id} 
                className="bg-gray-700 p-3 rounded-lg cursor-pointer hover:bg-gray-600 transition-colors"
                onClick={() => setViewingTeam(team)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-semibold">{team.name}</span>
                  <span className="text-sm text-gray-400">{team.players_count} players</span>
                </div>
                <div className="mt-2">
                  <div className="flex justify-between text-sm">
                    <span>Remaining</span>
                    <span className={`font-bold ${team.remaining_budget < 100000 ? 'text-red-400' : 'text-green-400'}`}>
                      ₹{(team.remaining_budget / 100000).toFixed(2)}L
                    </span>
                  </div>
                  <div className="w-full bg-gray-600 h-2 rounded-full mt-1">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${(team.remaining_budget / team.initial_budget) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Auction Interface */}
        <div className="col-span-6 space-y-4">
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4">Live Bidding</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Search Player</label>
                <input
                  type="text"
                  placeholder="Type to search..."
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Select Player</label>
                <select
                  className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-white"
                  size={8}
                  value={selectedPlayer?.id || ''}
                  onChange={(e) => {
                    const player = unsold_players.find((p: Player) => p.id === parseInt(e.target.value));
                    setSelectedPlayer(player || null);
                    setBidPrice(player?.base_price?.toString() || '');
                  }}
                >
                  <option value="">Select a player...</option>
                  {filteredPlayers?.map((player: Player) => (
                    <option key={player.id} value={player.id}>
                      {player.name} | {player.category || 'N/A'} | {player.role || 'N/A'} | Pts:{player.points || 0} | Base:₹{player.base_price}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPlayer && (
                <div className="bg-gray-700 p-4 rounded-lg">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold">{selectedPlayer.name}</h3>
                      <div className="flex gap-2 mt-1">
                        <span className={`px-2 py-1 rounded text-xs font-bold ${getCategoryBadge(selectedPlayer.category)}`}>
                          {selectedPlayer.category || 'N/A'}
                        </span>
                        <span className="px-2 py-1 rounded text-xs bg-blue-600">
                          {selectedPlayer.role || 'N/A'}
                        </span>
                        <span className="px-2 py-1 rounded text-xs bg-green-600">
                          {selectedPlayer.points || 0} Pts
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Base Price</p>
                      <p className="text-xl font-bold text-green-400">₹{selectedPlayer.base_price.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Buying Team</label>
                      <select
                        className="w-full p-2 rounded bg-gray-600 border border-gray-500 text-white"
                        value={selectedTeam}
                        onChange={(e) => setSelectedTeam(parseInt(e.target.value))}
                      >
                        <option value={0}>Select team...</option>
                        {teams?.map((team: Team) => (
                          <option 
                            key={team.id} 
                            value={team.id}
                            disabled={parseFloat(bidPrice) > team.remaining_budget}
                          >
                            {team.name} (₹{(team.remaining_budget/100000).toFixed(1)}L)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Final Price (₹)</label>
                      <input
                        type="number"
                        className="w-full p-2 rounded bg-gray-600 border border-gray-500 text-white"
                        value={bidPrice}
                        onChange={(e) => setBidPrice(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSell()}
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSell}
                    disabled={!selectedTeam || !bidPrice || sellMutation.isPending}
                    className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-3 rounded-lg transition-colors"
                  >
                    {sellMutation.isPending ? 'Processing...' : 'CONFIRM SOLD (Enter)'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Team Details or Recent Sales */}
        <div className="col-span-3 bg-gray-800 rounded-lg p-4 h-[calc(100vh-100px)] overflow-auto">
          {viewingTeam ? (
            /* Team Details View */
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{viewingTeam.name}</h2>
                <button 
                  onClick={() => setViewingTeam(null)}
                  className="text-sm text-gray-400 hover:text-white"
                >
                  ✕ Close
                </button>
              </div>

              {/* Team Stats */}
              {(() => {
                const stats = getTeamStats(viewingTeam.id);
                return (
                  <div className="bg-gray-700 p-3 rounded-lg mb-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Players:</span>
                      <span className="font-bold">{stats.playerCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Spent:</span>
                      <span className="font-bold text-red-400">₹{(stats.totalSpent/100000).toFixed(2)}L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg Price:</span>
                      <span className="font-bold">₹{(stats.avgPrice/100000).toFixed(2)}L</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-purple-400">Platinum: {stats.categories.platinum}</span>
                      <span className="text-yellow-400">Gold: {stats.categories.gold}</span>
                      <span className="text-gray-400">Silver: {stats.categories.silver}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Team Players List */}
              <h3 className="font-semibold mb-2">Bought Players</h3>
              <div className="space-y-2">
                {getTeamPlayers(viewingTeam.id).length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No players bought yet</p>
                ) : (
                  getTeamPlayers(viewingTeam.id).map((auction: Auction) => (
                    <div key={auction.id} className="bg-gray-700 p-3 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{auction.player.name}</p>
                          <div className="flex gap-1 mt-1">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${getCategoryBadge(auction.player.category)}`}>
                              {auction.player.category || 'N/A'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-xs bg-blue-600">
                              {auction.player.role || 'N/A'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {auction.player.points || 0} Pts
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-400">₹{auction.price.toLocaleString()}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(auction.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Recent Sales View */
            <div>
              <h2 className="text-xl font-bold mb-4">Recent Sales</h2>
              <div className="space-y-2">
                {recent_sales?.map((auction: Auction) => (
                  <div key={auction.id} className="bg-gray-700 p-3 rounded-lg text-sm">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-semibold">{auction.player.name}</p>
                        <div className="flex gap-1 mt-1">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${getCategoryBadge(auction.player.category)}`}>
                            {auction.player.category || 'N/A'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-xs bg-blue-600">
                            {auction.player.points || 0} Pts
                          </span>
                        </div>
                        <p className="text-gray-400 text-xs mt-1">{auction.team.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-400">₹{auction.price.toLocaleString()}</p>
                        <button
                          onClick={() => undoMutation.mutate(auction.id)}
                          className="text-xs text-red-400 hover:text-red-300 mt-1"
                          disabled={undoMutation.isPending}
                        >
                          Undo
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}