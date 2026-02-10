'use client';

import { useState, useMemo } from 'react';
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
  const [similarPlayersModal, setSimilarPlayersModal] = useState<{
    isOpen: boolean;
    soldPlayer: Player | null;
    similarPlayers: Player[];
  }>({
    isOpen: false,
    soldPlayer: null,
    similarPlayers: []
  });
  
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

  // Category Price Statistics
  const categoryStats = useMemo(() => {
    if (!liveData?.recent_sales) return null;

    const stats = {
      platinum: { count: 0, total: 0, min: Infinity, max: 0, avg: 0 },
      gold: { count: 0, total: 0, min: Infinity, max: 0, avg: 0 },
      silver: { count: 0, total: 0, min: Infinity, max: 0, avg: 0 },
    };

    liveData.recent_sales.forEach((auction: Auction) => {
      const cat = auction.player.category?.toLowerCase() as keyof typeof stats;
      if (stats[cat]) {
        const price = auction.price;
        stats[cat].count += 1;
        stats[cat].total += price;
        stats[cat].min = Math.min(stats[cat].min, price);
        stats[cat].max = Math.max(stats[cat].max, price);
      }
    });

    // Calculate averages and handle empty categories
    (Object.keys(stats) as Array<keyof typeof stats>).forEach(cat => {
      if (stats[cat].count > 0) {
        stats[cat].avg = stats[cat].total / stats[cat].count;
        if (stats[cat].min === Infinity) stats[cat].min = 0;
      }
    });

    return stats;
  }, [liveData?.recent_sales]);

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

  const handleSoldPlayerClick = (soldPlayer: Player) => {
    if (!liveData?.unsold_players) return;

    const similar = liveData.unsold_players.filter((p: Player) => 
      p.id !== soldPlayer.id &&
      p.category?.toLowerCase() === soldPlayer.category?.toLowerCase() &&
      p.role?.toLowerCase() === soldPlayer.role?.toLowerCase() &&
      p.points === soldPlayer.points
    );

    setSimilarPlayersModal({
      isOpen: true,
      soldPlayer: soldPlayer,
      similarPlayers: similar
    });
  };

  const closeSimilarModal = () => {
    setSimilarPlayersModal({
      isOpen: false,
      soldPlayer: null,
      similarPlayers: []
    });
  };

  const getTeamPlayers = (teamId: number) => {
    return liveData?.recent_sales?.filter((a: Auction) => a.team.id === teamId) || [];
  };

  const getTeamStats = (teamId: number) => {
    const teamAuctions = getTeamPlayers(teamId);
    const totalSpent = teamAuctions.reduce((sum: number, a: Auction) => sum + a.price, 0);
    const totalPoints = teamAuctions.reduce((sum: number, a: Auction) => sum + (a.player.points || 0), 0);
    const playerCount = teamAuctions.length;
    const avgPrice = playerCount > 0 ? totalSpent / playerCount : 0;
    
    const categories = {
      platinum: teamAuctions.filter((a: Auction) => a.player.category?.toLowerCase() === 'platinum').length,
      gold: teamAuctions.filter((a: Auction) => a.player.category?.toLowerCase() === 'gold').length,
      silver: teamAuctions.filter((a: Auction) => a.player.category?.toLowerCase() === 'silver').length,
    };

    return { totalSpent, totalPoints, playerCount, avgPrice, categories };
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

  // Sorted teams: selected team first, then by points descending
  const sortedTeams = useMemo(() => {
    if (!liveData?.teams || !liveData?.recent_sales) return [];
    
    const getTeamPoints = (teamId: number) => {
      return liveData.recent_sales
        .filter((a: Auction) => a.team.id === teamId)
        .reduce((sum: number, a: Auction) => sum + (a.player.points || 0), 0);
    };
    
    const sorted = [...liveData.teams].sort((a, b) => getTeamPoints(b.id) - getTeamPoints(a.id));
    
    if (selectedTeam) {
      const selectedTeamIndex = sorted.findIndex(t => t.id === selectedTeam);
      if (selectedTeamIndex > 0) {
        const selected = sorted.splice(selectedTeamIndex, 1)[0];
        sorted.unshift(selected);
      }
    }
    
    return sorted;
  }, [liveData?.teams, liveData?.recent_sales, selectedTeam]);

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

      {/* Category Price Statistics */}
      {categoryStats && (
        <div className="mb-6 bg-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-bold mb-3">Category Price Statistics</h2>
          <div className="grid grid-cols-3 gap-4">
            {(['platinum', 'gold', 'silver'] as const).map((cat) => {
              const stat = categoryStats[cat];
              if (stat.count === 0) {
                return (
                  <div key={cat} className="bg-gray-700 p-3 rounded-lg text-center">
                    <h3 className={`font-bold capitalize mb-2 ${getCategoryColor(cat)}`}>{cat}</h3>
                    <p className="text-sm text-gray-500">No sales yet</p>
                  </div>
                );
              }
              return (
                <div key={cat} className="bg-gray-700 p-3 rounded-lg">
                  <h3 className={`font-bold capitalize mb-2 ${getCategoryColor(cat)}`}>
                    {cat} <span className="text-xs text-gray-400">({stat.count} sold)</span>
                  </h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Min:</span>
                      <span className="text-green-400">₹{(stat.min / 100000).toFixed(1)}L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg:</span>
                      <span className="text-blue-400 font-bold">₹{(stat.avg / 100000).toFixed(1)}L</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Max:</span>
                      <span className="text-red-400">₹{(stat.max / 100000).toFixed(1)}L</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Team Budget Board - Selected team first, then by points */}
        <div className="col-span-3 bg-gray-800 rounded-lg p-4 overflow-auto h-[calc(100vh-100px)]">
          <h2 className="text-xl font-bold mb-4">Teams</h2>
          <div className="space-y-3">
            {sortedTeams.map((team: Team, index: number) => {
              const teamPoints = getTeamPlayers(team.id).reduce((sum: number, a: Auction) => sum + (a.player.points || 0), 0);
              const isSelected = team.id === selectedTeam;
              return (
                <div 
                  key={team.id} 
                  className={`bg-gray-700 p-3 rounded-lg cursor-pointer hover:bg-gray-600 transition-colors relative ${
                    isSelected ? 'ring-2 ring-blue-500 bg-blue-900 bg-opacity-30' : ''
                  }`}
                  onClick={() => setViewingTeam(team)}
                >
                  {isSelected && (
                    <div className="absolute -top-2 -left-2 bg-blue-500 text-white text-xs rounded-full px-2 py-1 font-bold">
                      SELECTED
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-yellow-400">#{index + 1}</span>
                      <span className="font-semibold">{team.name}</span>
                    </div>
                    <span className="text-sm text-gray-400">{team.players_count} players</span>
                  </div>
                  <div className="mt-1">
                    <span className="text-sm text-blue-400 font-semibold">{teamPoints} Pts</span>
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
              );
            })}
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

              {(() => {
                const stats = getTeamStats(viewingTeam.id);
                return (
                  <>
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
                      <div className="flex justify-between">
                        <span className="text-gray-400">Total Points:</span>
                        <span className="font-bold text-blue-400">{stats.totalPoints} Pts</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-purple-400">Platinum: {stats.categories.platinum}</span>
                        <span className="text-yellow-400">Gold: {stats.categories.gold}</span>
                        <span className="text-gray-400">Silver: {stats.categories.silver}</span>
                      </div>
                    </div>

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
                  </>
                );
              })()}
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold mb-4">Recent Sales</h2>
              <div className="space-y-2">
                {recent_sales?.map((auction: Auction) => (
                  <div 
                    key={auction.id} 
                    className="bg-gray-700 p-3 rounded-lg text-sm cursor-pointer hover:bg-gray-600 transition-colors"
                    onClick={() => handleSoldPlayerClick(auction.player)}
                  >
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
                          onClick={(e) => {
                            e.stopPropagation();
                            undoMutation.mutate(auction.id);
                          }}
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

      {/* Similar Players Modal */}
      {similarPlayersModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                Similar Players to {similarPlayersModal.soldPlayer?.name}
              </h2>
              <button 
                onClick={closeSimilarModal}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="mb-4 p-3 bg-gray-700 rounded-lg">
              <p className="text-sm text-gray-300">
                Showing unsold players with:{' '}
                <span className={`font-bold ${getCategoryColor(similarPlayersModal.soldPlayer?.category)}`}>
                  {similarPlayersModal.soldPlayer?.category}
                </span>
                {' | '}
                <span className="font-bold text-blue-400">
                  {similarPlayersModal.soldPlayer?.role}
                </span>
                {' | '}
                <span className="font-bold text-green-400">
                  {similarPlayersModal.soldPlayer?.points} Pts
                </span>
              </p>
            </div>

            {similarPlayersModal.similarPlayers.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-lg">No similar players available</p>
                <p className="text-sm mt-2">No unsold players match this category, role, and points combination</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 mb-2">
                  {similarPlayersModal.similarPlayers.length} similar player(s) found:
                </p>
                {similarPlayersModal.similarPlayers.map((player: Player) => (
                  <div 
                    key={player.id} 
                    className="bg-gray-700 p-3 rounded-lg flex justify-between items-center hover:bg-gray-600 transition-colors"
                  >
                    <div>
                      <p className="font-semibold">{player.name}</p>
                      <div className="flex gap-2 mt-1">
                        <span className={`px-2 py-1 rounded text-xs ${getCategoryBadge(player.category)}`}>
                          {player.category || 'N/A'}
                        </span>
                        <span className="px-2 py-1 rounded text-xs bg-blue-600">
                          {player.role || 'N/A'}
                        </span>
                        <span className="px-2 py-1 rounded text-xs bg-green-600">
                          {player.points || 0} Pts
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Base Price</p>
                      <p className="font-bold text-green-400">₹{player.base_price?.toLocaleString()}</p>
                      <button
                        onClick={() => {
                          setSelectedPlayer(player);
                          setBidPrice(player.base_price?.toString() || '');
                          closeSimilarModal();
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-bold transition-colors"
                      >
                        Select for Bid
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}