import React, { useState } from 'react';
import { CommunityPreview } from '../components/CommunityPreview';
import { Button } from '../components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const TestCommunityPreviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [isJoining, setIsJoining] = useState(false);
  const [scenario, setScenario] = useState<'new' | 'existing' | 'loading' | 'error'>('existing');

  const handleBack = () => {
    navigate('/');
  };

  const handleJoin = () => {
    setIsJoining(true);
    setTimeout(() => {
      setIsJoining(false);
      alert('Join action triggered! (This would normally proceed to location validation)');
    }, 2000);
  };

  // Sample preview data for existing community
  const existingCommunityData = {
    name: "Montevideo Tech Hub",
    description: "A vibrant community for tech enthusiasts, developers, and innovators in Montevideo. Share ideas, collaborate on projects, and network with local tech professionals.",
    member_count: 42,
    created_at: Math.floor(Date.now() / 1000) - 86400 * 7, // 7 days ago
    location_name: "WeWork Montevideo",
    admin_count: 3
  };

  // Sample preview data for new community (first scan)
  const newCommunityData = {
    name: "Café Literatura",
    description: "A cozy spot for book lovers and coffee enthusiasts. Discuss your latest reads, share recommendations, and enjoy the ambiance.",
    member_count: 0,
    created_at: Math.floor(Date.now() / 1000),
    location_name: "Café Literatura, Ciudad Vieja",
    admin_count: 0,
    is_first_scan: true
  };

  const getPreviewData = () => {
    switch (scenario) {
      case 'new':
        return newCommunityData;
      case 'existing':
        return existingCommunityData;
      case 'loading':
        return undefined;
      case 'error':
        return undefined;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={handleBack}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">Test Community Preview</h1>
        <p className="text-gray-600">
          Testing the community preview component with different scenarios
        </p>
      </div>

      {/* Scenario selector */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h2 className="font-semibold mb-3">Test Scenarios:</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={scenario === 'existing' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScenario('existing')}
          >
            Existing Community
          </Button>
          <Button
            variant={scenario === 'new' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScenario('new')}
          >
            New Community (First Scan)
          </Button>
          <Button
            variant={scenario === 'loading' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScenario('loading')}
          >
            Loading State
          </Button>
          <Button
            variant={scenario === 'error' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setScenario('error')}
          >
            Error State
          </Button>
        </div>
      </div>

      {/* Community Preview Component */}
      <CommunityPreview
        communityId="test-community-123"
        previewData={getPreviewData()}
        onJoin={handleJoin}
        isJoining={isJoining}
        error={scenario === 'error' ? 'Failed to load community data. Please check your connection and try again.' : undefined}
        isFirstScanner={scenario === 'new'}
      />

      {/* Component info */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h2 className="font-semibold mb-2">Component Features:</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
          <li>Displays community name, description, and metadata</li>
          <li>Shows member count and creation date</li>
          <li>Indicates if user will be admin (first scanner)</li>
          <li>Loading skeleton while fetching data</li>
          <li>Error state handling</li>
          <li>Join button with loading state</li>
          <li>Responsive design with shadcn/ui components</li>
        </ul>
      </div>
    </div>
  );
};