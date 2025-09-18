import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  MapPin,
  Users,
  MessageSquare,
  Calendar,
  TrendingUp,
  Shield,
  Zap,
  Coffee,
  AlertCircle,
  CheckCircle,
  Flame,
  Star,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useToast } from '@/hooks/useToast';

// Mock data for development
const mockCommunity = {
  id: 'mock-oslo-coffee-collective',
  name: 'Oslo Coffee Collective',
  description: 'The premier community for coffee enthusiasts in Oslo. Share your favorite spots, brewing techniques, and connect with fellow coffee lovers who frequent the best cafés in the city.',
  memberCount: 342,
  activeNow: 28,
  location: {
    name: 'Fuglen Coffee Roasters',
    address: 'Universitetsgata 2, 0164 Oslo',
    latitude: 59.9139,
    longitude: 10.7522,
    distance: '15m away'
  },
  stats: {
    messagesPerDay: 127,
    growthRate: 23, // percentage
    foundedDaysAgo: 45,
    activityLevel: 'high' as const,
    peakHours: '14:00 - 18:00'
  },
  logo: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=200&h=200&fit=crop',
  banner: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=1200&h=400&fit=crop',
  tags: ['Coffee', 'Oslo', 'Social', 'Meetups'],
  rules: [
    'Be respectful and friendly to all members',
    'Share your coffee knowledge generously',
    'No spam or commercial promotion without permission',
    'Keep discussions relevant to coffee and Oslo café culture'
  ],
  recentMembers: [
    { id: '1', name: 'Erik', joined: '2 minutes ago', avatar: 'https://i.pravatar.cc/150?img=12' },
    { id: '2', name: 'Astrid', joined: '15 minutes ago', avatar: 'https://i.pravatar.cc/150?img=5' },
    { id: '3', name: 'Magnus', joined: '1 hour ago', avatar: 'https://i.pravatar.cc/150?img=8' },
    { id: '4', name: 'Ingrid', joined: '3 hours ago', avatar: 'https://i.pravatar.cc/150?img=9' },
  ],
  topContributors: [
    { id: '5', name: 'Lars', messages: 523, avatar: 'https://i.pravatar.cc/150?img=3', badge: 'Founder' },
    { id: '6', name: 'Sofie', messages: 412, avatar: 'https://i.pravatar.cc/150?img=16', badge: 'Admin' },
    { id: '7', name: 'Henrik', messages: 389, avatar: 'https://i.pravatar.cc/150?img=11', badge: 'Top Contributor' },
  ]
};

const JoinCommunityMock = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isJoining, setIsJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  // Component for mock community join flow

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    navigate('/');
    return null;
  }

  const handleJoin = async () => {
    setIsJoining(true);

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    setHasJoined(true);
    setIsJoining(false);

    toast({
      title: 'Welcome to ' + mockCommunity.name + '!',
      description: 'You have successfully joined the community.',
    });

    // Navigate to community page after short delay
    setTimeout(() => {
      navigate('/community/mock-oslo-coffee-collective');
    }, 2000);
  };

  const getActivityEmoji = () => {
    const level = mockCommunity.stats.activityLevel;
    if (level === 'high') return '🔥';
    if (level === 'medium') return '⚡';
    return '💤';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Banner Image */}
      <div className="relative h-64 md:h-80 overflow-hidden">
        <img
          src={mockCommunity.banner}
          alt="Community banner"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 -mt-20 relative z-10 pb-8">
        <Card className="max-w-4xl mx-auto">
          <CardHeader className="pb-4">
            <div className="flex items-start gap-4">
              {/* Logo */}
              <Avatar className="h-20 w-20 border-4 border-white dark:border-gray-800">
                <AvatarImage src={mockCommunity.logo} alt={mockCommunity.name} />
                <AvatarFallback>{mockCommunity.name.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>

              {/* Title and Description */}
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <CardTitle className="text-2xl">{mockCommunity.name}</CardTitle>
                  <Badge variant="default" className="gap-1">
                    <span className="text-lg">{getActivityEmoji()}</span>
                    <span>Highly Active</span>
                  </Badge>
                </div>
                <CardDescription className="mt-2 text-base">
                  {mockCommunity.description}
                </CardDescription>

                {/* Tags */}
                <div className="flex gap-2 mt-3 flex-wrap">
                  {mockCommunity.tags.map(tag => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-center gap-1">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">{mockCommunity.memberCount}</span>
                </div>
                <p className="text-xs text-muted-foreground">Members</p>
              </div>

              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-center gap-1">
                  <Zap className="h-4 w-4 text-green-500" />
                  <span className="text-2xl font-bold text-green-500">{mockCommunity.activeNow}</span>
                </div>
                <p className="text-xs text-muted-foreground">Active Now</p>
              </div>

              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-center gap-1">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-2xl font-bold">{mockCommunity.stats.messagesPerDay}</span>
                </div>
                <p className="text-xs text-muted-foreground">Msgs/Day</p>
              </div>

              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <span className="text-2xl font-bold text-blue-500">+{mockCommunity.stats.growthRate}%</span>
                </div>
                <p className="text-xs text-muted-foreground">Growth</p>
              </div>
            </div>

            {/* Location Info */}
            <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
              <MapPin className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                <strong>Physical Location:</strong> {mockCommunity.location.name}
                <br />
                <span className="text-sm">{mockCommunity.location.address}</span>
                <br />
                <span className="text-sm font-medium">You are {mockCommunity.location.distance} from this location</span>
              </AlertDescription>
            </Alert>

            {/* Community Info Sections */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Recent Members */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Recent Members
                </h3>
                <div className="space-y-2">
                  {mockCommunity.recentMembers.map(member => (
                    <div key={member.id} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.avatar} alt={member.name} />
                        <AvatarFallback>{member.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">Joined {member.joined}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Contributors */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Top Contributors
                </h3>
                <div className="space-y-2">
                  {mockCommunity.topContributors.map(contributor => (
                    <div key={contributor.id} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={contributor.avatar} alt={contributor.name} />
                        <AvatarFallback>{contributor.name[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{contributor.name}</p>
                        <p className="text-xs text-muted-foreground">{contributor.messages} messages</p>
                      </div>
                      {contributor.badge && (
                        <Badge variant="outline" className="text-xs">
                          {contributor.badge}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* Community Rules */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Community Rules
              </h3>
              <ul className="space-y-2">
                {mockCommunity.rules.map((rule, index) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground mt-0.5">{index + 1}.</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Join Button */}
            {!hasJoined ? (
              <Button
                onClick={handleJoin}
                disabled={isJoining}
                size="lg"
                className="w-full"
              >
                {isJoining ? (
                  <>
                    <AlertCircle className="mr-2 h-4 w-4 animate-spin" />
                    Verifying Location...
                  </>
                ) : (
                  <>
                    <MapPin className="mr-2 h-4 w-4" />
                    Join Community
                  </>
                )}
              </Button>
            ) : (
              <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  <strong>Welcome!</strong> You've successfully joined {mockCommunity.name}.
                  Redirecting to community page...
                </AlertDescription>
              </Alert>
            )}

            {/* Additional Info */}
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>Founded {mockCommunity.stats.foundedDaysAgo} days ago</span>
              </div>
              <div className="flex items-center gap-1">
                <Coffee className="h-3 w-3" />
                <span>Peak hours: {mockCommunity.stats.peakHours}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Development Notice */}
        <Alert className="max-w-4xl mx-auto mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Development Mode:</strong> This is a mock page with sample data for local development only.
            In production, this page would show real community data fetched from the relay.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
};

export default JoinCommunityMock;