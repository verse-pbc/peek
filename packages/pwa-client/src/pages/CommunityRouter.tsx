import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { isCommunityMember } from '../services/community-storage';
import { JoinFlow } from './JoinFlow';
import Community from './Community';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';

export function CommunityRouter() {
  const { communityId } = useParams<{ communityId: string }>();
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [justJoined, setJustJoined] = useState(false);

  useEffect(() => {
    if (communityId) {
      setIsMember(isCommunityMember(communityId));
    }
  }, [communityId]);

  const handleJoinSuccess = () => {
    setJustJoined(true);
    setIsMember(true);
  };

  // Loading while checking membership
  if (isMember === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg font-medium">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return isMember ? (
    <Community showWelcomeBack={justJoined} />
  ) : (
    <JoinFlow onJoinSuccess={handleJoinSuccess} />
  );
}

export default CommunityRouter;
