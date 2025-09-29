import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { LatLng, Map as LeafletMap } from 'leaflet';
import { Loader2, MapPin, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FogOfWarOverlay } from '@/components/FogOfWarOverlay';
import { DiscoveryService, DiscoveryMap as IDiscoveryMap } from '@/services/discovery-service';
import { useToast } from '@/hooks/useToast';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { Icon } from 'leaflet';

interface LeafletIconPrototype {
  _getIconUrl?: () => string;
}
delete (Icon.Default.prototype as LeafletIconPrototype)._getIconUrl;
Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'wss://peek.hol.is';
const FOG_RADIUS_METERS = 1000; // 1km radius circles

// Component to manage the fog overlay
function MapManager({ discoveryMap, fogEnabled }: {
  discoveryMap: IDiscoveryMap | null;
  fogEnabled: boolean;
}) {
  const map = useMap();
  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);

  useEffect(() => {
    setLeafletMap(map);
  }, [map]);

  const fogPoints = discoveryMap?.points.map(point => ({
    lat: point.lat,
    lng: point.lng,
    radiusMeters: FOG_RADIUS_METERS
  })) || [];

  return fogEnabled ? (
    <FogOfWarOverlay
      map={leafletMap}
      points={fogPoints}
      fogOpacity={0.7}
      fogColor="#1a1a1a"
    />
  ) : null;
}

export const DiscoveryMap: React.FC = () => {
  const { toast } = useToast();
  const [discoveryMap, setDiscoveryMap] = useState<IDiscoveryMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [fogEnabled, setFogEnabled] = useState(true);
  const [mapCenter] = useState<LatLng>(new LatLng(37.7749, -122.4194)); // Default to SF
  const discoveryServiceRef = useRef<DiscoveryService | null>(null);

  useEffect(() => {
    const loadDiscoveryMap = async () => {
      try {
        setLoading(true);
        const service = new DiscoveryService(RELAY_URL);
        discoveryServiceRef.current = service;

        // Fetch initial map
        const map = await service.fetchDiscoveryMap();
        setDiscoveryMap(map);

        if (map.points.length === 0) {
          toast({
            title: "No communities yet",
            description: "Be the first to create a community!",
          });
        }

        // Subscribe to updates
        const unsubscribe = service.subscribeToDiscoveryUpdates((updatedMap) => {
          setDiscoveryMap(updatedMap);
          toast({
            title: "Map updated",
            description: "New community discovered!",
          });
        });

        // Cleanup on unmount
        return () => {
          unsubscribe();
        };
      } catch (error) {
        console.error('Failed to load discovery map:', error);
        toast({
          title: "Failed to load map",
          description: "Could not connect to relay",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    loadDiscoveryMap();

    return () => {
      if (discoveryServiceRef.current) {
        discoveryServiceRef.current.close();
      }
    };
  }, [toast]);

  const handleToggleFog = () => {
    setFogEnabled(prev => !prev);
    toast({
      title: fogEnabled ? "Fog disabled" : "Fog enabled",
      description: fogEnabled
        ? "Showing exact community locations"
        : "Community locations are now hidden in fog",
    });
  };

  const handleFlyToLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Note: We'll need to pass this to the map component to actually fly to it
          // For now, just show the toast
          toast({
            title: "Location found",
            description: `Your location: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
          });
        },
        (error) => {
          toast({
            title: "Location error",
            description: error.message,
            variant: "destructive"
          });
        }
      );
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Community Discovery Map
          </CardTitle>
          <CardDescription>
            Explore nearby communities. Each fog circle contains a QR code somewhere within its 1km radius.
            Go out and find them!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Button
              onClick={handleToggleFog}
              variant={fogEnabled ? "default" : "secondary"}
              size="sm"
            >
              {fogEnabled ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Fog On
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Fog Off
                </>
              )}
            </Button>
            <Button
              onClick={handleFlyToLocation}
              variant="outline"
              size="sm"
            >
              <MapPin className="h-4 w-4 mr-2" />
              My Location
            </Button>
            {discoveryMap && (
              <div className="ml-auto text-sm text-muted-foreground flex items-center">
                {discoveryMap.points.length} {discoveryMap.points.length === 1 ? 'community' : 'communities'}
              </div>
            )}
          </div>

          <div className="relative">
            <div className="h-[600px] w-full rounded-lg overflow-hidden border">
              {loading ? (
                <div className="h-full w-full flex items-center justify-center bg-muted">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading discovery map...</p>
                  </div>
                </div>
              ) : (
                <MapContainer
                  center={mapCenter}
                  zoom={13}
                  className="h-full w-full"
                  zoomControl={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapManager discoveryMap={discoveryMap} fogEnabled={fogEnabled} />
                </MapContainer>
              )}
            </div>
          </div>

          {discoveryMap && discoveryMap.points.length > 0 && (
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-2">Active Communities</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {discoveryMap.points.map(point => (
                  <div key={point.id} className="flex items-center gap-2 text-sm">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{point.name}</span>
                    {point.about && (
                      <span className="text-muted-foreground truncate">
                        - {point.about}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};