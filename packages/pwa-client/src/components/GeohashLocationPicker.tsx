import React, { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { MapPin, Navigation, Hash, Map as MapIcon, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import {
  validateGeohash,
  geohashToLatLng,
  getGeohashBounds,
  getGeohashesInBounds
} from '@/lib/geohash-utils';
import 'leaflet/dist/leaflet.css';

interface GeohashLocationPickerProps {
  onLocationSelected: (location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }) => void;
  initialLocation?: { latitude: number; longitude: number };
}

// Component to track map bounds and generate geohashes
function GeohashGridOverlay({ onCellClick }: { onCellClick: (hash: string) => void }) {
  const [geohashes, setGeohashes] = useState<string[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const map = useMap();

  const updateGeohashes = useCallback(() => {
    const bounds = map.getBounds();
    const hashes = getGeohashesInBounds({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    }, 8, 50); // Level 8, max 50 cells
    setGeohashes(hashes);
  }, [map]);

  useEffect(() => {
    updateGeohashes();
  }, [updateGeohashes]);

  useMapEvents({
    moveend: updateGeohashes,
    zoomend: updateGeohashes
  });

  const handleCellClick = (hash: string) => {
    setSelectedHash(hash);
    onCellClick(hash);
  };

  return (
    <>
      {geohashes.map((hash) => {
        const bounds = getGeohashBounds(hash);
        const positions: [number, number][] = [
          [bounds.minLat, bounds.minLng],
          [bounds.minLat, bounds.maxLng],
          [bounds.maxLat, bounds.maxLng],
          [bounds.maxLat, bounds.minLng],
        ];

        const isSelected = hash === selectedHash;

        return (
          <Polygon
            key={hash}
            positions={positions}
            pathOptions={{
              color: isSelected ? '#10b981' : '#3b82f6',
              weight: isSelected ? 3 : 1,
              fillColor: isSelected ? '#10b981' : '#3b82f6',
              fillOpacity: isSelected ? 0.3 : 0.1
            }}
            eventHandlers={{
              click: () => handleCellClick(hash),
              mouseover: (e) => {
                e.target.setStyle({ fillOpacity: 0.4 });
              },
              mouseout: (e) => {
                e.target.setStyle({ fillOpacity: isSelected ? 0.3 : 0.1 });
              }
            }}
          >
            <Tooltip permanent direction="center" className="geohash-label">
              {hash}
            </Tooltip>
          </Polygon>
        );
      })}
    </>
  );
}

export const GeohashLocationPicker: React.FC<GeohashLocationPickerProps> = ({
  onLocationSelected,
  initialLocation
}) => {
  const { toast } = useToast();
  const [geohashInput, setGeohashInput] = useState('');
  const [selectedGeohash, setSelectedGeohash] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    initialLocation
      ? [initialLocation.latitude, initialLocation.longitude]
      : [37.7749, -122.4194] // Default to SF
  );

  // Load user's current location for map
  useEffect(() => {
    if (!initialLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMapCenter([pos.coords.latitude, pos.coords.longitude]);
        },
        () => {
          // Silently fail, keep default
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, [initialLocation]);

  const handleUseRealGPS = useCallback(() => {
    if (!navigator.geolocation) {
      toast({
        title: "GPS not available",
        description: "Your browser doesn't support geolocation",
        variant: "destructive"
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const location = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: Math.floor(Date.now() / 1000)
        };
        onLocationSelected(location);
        toast({
          title: "Using real GPS",
          description: `Location: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`,
        });
      },
      (error) => {
        toast({
          title: "GPS error",
          description: error.message,
          variant: "destructive"
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onLocationSelected, toast]);

  const handleGeohashInputChange = (value: string) => {
    // Only allow valid base32 characters
    const cleaned = value.toLowerCase().replace(/[^0-9b-hj-np-z]/g, '');
    setGeohashInput(cleaned);

    // Auto-select if exactly 8 chars and valid
    if (cleaned.length === 8 && validateGeohash(cleaned)) {
      setSelectedGeohash(cleaned);
    } else {
      setSelectedGeohash(null);
    }
  };

  const handleOverrideWithGeohash = useCallback(() => {
    if (!selectedGeohash) return;

    const center = geohashToLatLng(selectedGeohash);
    const location = {
      latitude: center.lat,
      longitude: center.lng,
      accuracy: 10, // Approximate level 8 accuracy
      timestamp: Math.floor(Date.now() / 1000)
    };

    onLocationSelected(location);
    toast({
      title: "Location overridden",
      description: `Using geohash: ${selectedGeohash}`,
    });
  }, [selectedGeohash, onLocationSelected, toast]);

  const handleMapCellClick = (hash: string) => {
    setGeohashInput(hash);
    setSelectedGeohash(hash);
    toast({
      title: "Cell selected",
      description: `Geohash: ${hash}`,
    });
  };

  const getGeohashStatus = () => {
    const len = geohashInput.length;
    if (len === 0) return { text: 'Enter geohash', color: 'text-gray-400', valid: false };
    if (len < 8) return { text: `Level: ${len}/8`, color: 'text-orange-500', valid: false };
    if (len === 8 && validateGeohash(geohashInput)) {
      return { text: 'Level: 8/8 ✓', color: 'text-green-600', valid: true };
    }
    if (len > 8) return { text: 'Too long! Use 8 chars', color: 'text-red-500', valid: false };
    return { text: 'Invalid format', color: 'text-red-500', valid: false };
  };

  const status = getGeohashStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Override GPS Location (Dev Mode)
        </CardTitle>
        <CardDescription>
          Choose how to set a test location. Level 8 geohashes cover ~38m × 19m area.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="real" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="real">
              <Navigation className="h-4 w-4 mr-2" />
              Real GPS
            </TabsTrigger>
            <TabsTrigger value="geohash">
              <Hash className="h-4 w-4 mr-2" />
              Geohash
            </TabsTrigger>
            <TabsTrigger value="map">
              <MapIcon className="h-4 w-4 mr-2" />
              Map
            </TabsTrigger>
          </TabsList>

          {/* Real GPS Tab */}
          <TabsContent value="real" className="space-y-4">
            <Alert>
              <Navigation className="h-4 w-4" />
              <AlertDescription>
                Use your device's actual GPS location for testing.
              </AlertDescription>
            </Alert>
            <Button onClick={handleUseRealGPS} className="w-full" size="lg">
              <Navigation className="h-5 w-5 mr-2" />
              Use Real GPS Location
            </Button>
          </TabsContent>

          {/* Geohash Input Tab */}
          <TabsContent value="geohash" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="geohash-input" className="flex items-center justify-between">
                <span>Geohash (Level 8)</span>
                <span className={`text-sm font-medium ${status.color}`}>
                  {status.text}
                </span>
              </Label>
              <Input
                id="geohash-input"
                type="text"
                value={geohashInput}
                onChange={(e) => handleGeohashInputChange(e.target.value)}
                placeholder="9q8yy1uj"
                maxLength={10}
                className={`font-mono ${
                  status.valid
                    ? 'border-green-500 focus-visible:ring-green-500'
                    : geohashInput.length > 8
                    ? 'border-red-500'
                    : ''
                }`}
              />
              <p className="text-xs text-muted-foreground">
                Enter exactly 8 characters (0-9, b-z except a,i,l,o)
              </p>
            </div>

            {selectedGeohash && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-900">
                  Valid level 8 geohash: <span className="font-mono font-bold">{selectedGeohash}</span>
                </AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleOverrideWithGeohash}
              className="w-full"
              size="lg"
              disabled={!selectedGeohash}
            >
              <MapPin className="h-5 w-5 mr-2" />
              Override Location
            </Button>
          </TabsContent>

          {/* Map Tab */}
          <TabsContent value="map" className="space-y-4">
            <Alert>
              <MapIcon className="h-4 w-4" />
              <AlertDescription>
                Click a geohash cell on the map to select it. Zoom in for better precision.
              </AlertDescription>
            </Alert>

            <div className="h-96 w-full rounded-lg overflow-hidden border">
              <MapContainer
                center={mapCenter}
                zoom={16}
                className="h-full w-full"
                zoomControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <GeohashGridOverlay onCellClick={handleMapCellClick} />
              </MapContainer>
            </div>

            {selectedGeohash && (
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-900">Selected:</span>
                  </div>
                  <span className="font-mono font-bold text-green-900">{selectedGeohash}</span>
                </div>
                <Button
                  onClick={handleOverrideWithGeohash}
                  className="w-full"
                  size="lg"
                >
                  <MapPin className="h-5 w-5 mr-2" />
                  Override with {selectedGeohash}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
