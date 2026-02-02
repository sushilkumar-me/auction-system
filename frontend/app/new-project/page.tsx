'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function NewProject() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [projectName, setProjectName] = useState('');
  const [totalTeams, setTotalTeams] = useState(10);
  const [teams, setTeams] = useState<Array<{ name: string; budget: number }>>(
    Array(10).fill(null).map((_, i) => ({ name: `Team ${i + 1}`, budget: 10000000 }))
  );
  const [ownTeamIndex, setOwnTeamIndex] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const createProject = async () => {
    setCreating(true);
    setError('');
    
    try {
      console.log('Creating project...');
      // Step 1: Create project
      const projectRes = await api.post('/projects', {
        name: projectName,
        total_teams: totalTeams
      });
      console.log('Project created:', projectRes.data);
      const projectId = projectRes.data.id;

      // Step 2: Create teams
      console.log('Creating teams...');
      const teamPromises = teams.map((team) => 
        api.post('/teams', {
          project_id: projectId,
          name: team.name,
          initial_budget: team.budget
        })
      );
      const teamResponses = await Promise.all(teamPromises);
      console.log('Teams created:', teamResponses.length);
      
      // Step 3: Set own team
      console.log('Setting own team...');
      await api.patch(`/projects/${projectId}`, {
        own_team_id: teamResponses[ownTeamIndex].data.id
      });

      // Step 4: Upload players if file exists
      if (file) {
        console.log('Uploading players...');
        const formData = new FormData();
        formData.append('file', file);
        await api.post(`/upload/players/${projectId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      router.push(`/auction/${projectId}`);
    } catch (err: any) {
      console.error('Full error:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Unknown error';
      setError(`Error: ${JSON.stringify(errorMsg)}`);
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-4">New Auction Project</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <strong>Error:</strong> {error}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Upload Dataset (Optional)</h2>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer block">
                <div className="text-gray-600">
                  {file ? file.name : 'Click to upload Excel file'}
                </div>
                <div className="text-sm text-gray-400 mt-2">
                  Columns: player_name, base_price, role, category, points
                </div>
              </label>
            </div>
            <div className="flex justify-end">
              <button 
                onClick={() => setStep(2)}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Auction Setup</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Project Name *</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full border rounded p-2"
                  placeholder="IPL 2025 Auction"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Number of Teams</label>
                <input
                  type="number"
                  value={totalTeams}
                  onChange={(e) => {
                    const num = parseInt(e.target.value) || 10;
                    setTotalTeams(num);
                    setTeams(Array(num).fill(null).map((_, i) => ({ 
                      name: `Team ${i + 1}`, 
                      budget: 10000000 
                    })));
                  }}
                  className="w-full border rounded p-2"
                />
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-medium mb-2">Team Configuration (Select your team)</h3>
              <div className="space-y-2 max-h-64 overflow-auto border rounded p-4">
                {teams.map((team, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="radio"
                      name="ownTeam"
                      checked={ownTeamIndex === idx}
                      onChange={() => setOwnTeamIndex(idx)}
                      className="mr-2"
                    />
                    <input
                      type="text"
                      value={team.name}
                      onChange={(e) => {
                        const newTeams = [...teams];
                        newTeams[idx].name = e.target.value;
                        setTeams(newTeams);
                      }}
                      className="flex-1 border rounded p-2"
                    />
                    <input
                      type="number"
                      value={team.budget}
                      onChange={(e) => {
                        const newTeams = [...teams];
                        newTeams[idx].budget = parseInt(e.target.value) || 10000000;
                        setTeams(newTeams);
                      }}
                      className="w-32 border rounded p-2"
                      step="100000"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep(1)} className="text-gray-600">Back</button>
              <button 
                onClick={() => setStep(3)}
                disabled={!projectName}
                className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Review
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Review & Initialize</h2>
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <p><strong>Project:</strong> {projectName}</p>
              <p><strong>Teams:</strong> {totalTeams}</p>
              <p><strong>Your Team:</strong> {teams[ownTeamIndex]?.name}</p>
              <p><strong>Players File:</strong> {file?.name || 'None'}</p>
            </div>
            
            <div className="flex justify-between">
              <button onClick={() => setStep(2)} className="text-gray-600">Back</button>
              <button 
                onClick={createProject}
                disabled={creating}
                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Initialize Auction'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
// Add this import at top
import DarkModeToggle from '@/components/DarkModeToggle';

// Add this inside the return, before the main div
<div className="absolute top-4 right-4">
  <DarkModeToggle />
</div>