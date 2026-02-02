'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Project } from '@/types';
import DarkModeToggle from '@/components/DarkModeToggle';

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadProjects();
  }, [router]);

  const loadProjects = () => {
    api.get('/projects')
      .then(response => {
        setProjects(response.data);
        setLoading(false);
      })
      .catch(() => {
        localStorage.removeItem('token');
        router.push('/login');
      });
  };

  const deleteProject = async (projectId: number, projectName: string) => {
    if (!confirm(`Delete "${projectName}"?`)) return;
    
    setDeleting(projectId);
    try {
      await api.delete(`/projects/${projectId}`);
      setProjects(projects.filter(p => p.id !== projectId));
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeleting(null);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Dark mode toggle - moved to left side */}
      <div className="fixed top-4 left-4 z-50">
        <DarkModeToggle />
      </div>
      
      <nav className="shadow-md p-4 flex justify-between items-center" style={{ backgroundColor: 'var(--bg-secondary)' }}>
        <h1 className="text-2xl font-bold ml-16">Auction Dashboard</h1>
        <button onClick={logout} className="text-red-500 hover:text-red-400 font-semibold">
          Logout
        </button>
      </nav>

      <div className="container mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-semibold">Your Auctions</h2>
          <Link
            href="/new-project"
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            New Project
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="p-6 rounded-lg shadow hover:shadow-lg"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
            >
              <Link href={`/auction/${project.id}`}>
                <h3 className="text-lg font-bold mb-2 hover:text-blue-400">{project.name}</h3>
              </Link>
              <p style={{ color: 'var(--text-secondary)' }}>Teams: {project.total_teams}</p>
              <p style={{ color: 'var(--text-secondary)' }}>Status: {project.status}</p>
              
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/auction/${project.id}`}
                  className="flex-1 text-center py-2 rounded bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Open
                </Link>
                <button
                  onClick={() => deleteProject(project.id, project.name)}
                  disabled={deleting === project.id}
                  className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                >
                  {deleting === project.id ? '...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {projects.length === 0 && (
          <div className="text-center mt-12" style={{ color: 'var(--text-secondary)' }}>
            <p>No projects yet. Create your first auction!</p>
          </div>
        )}
      </div>
    </div>
  );
}