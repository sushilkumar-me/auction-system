'use client';

import { useParams } from 'next/navigation';
import LiveAuction from '@/components/LiveAuction';

export default function AuctionPage() {
  const params = useParams();
  const projectId = parseInt(params.id as string);

  if (isNaN(projectId)) return <div>Invalid project ID</div>;

  return <LiveAuction projectId={projectId} />;
}