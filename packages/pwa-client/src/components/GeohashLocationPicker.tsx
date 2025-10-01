import React, { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { MapPin, Navigation, Hash } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import {
  validateGeohash,
  geohashToLatLng,
  getGeohashBounds,
  getGeohashesInBounds
} from '@/lib/geohash-utils';
import 'leaflet/dist/leaflet.css';
import './GeohashLocationPicker.css';

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
function GeohashGridOverlay({
  onCellClick,
  selectedHash
}: {
  onCellClick: (hash: string) => void;
  selectedHash: string | null;
}) {
  const [geohashes, setGeohashes] = useState<string[]>([]);
  const map = useMap();

  const updateGeohashes = useCallback(() => {
    const bounds = map.getBounds();
    const hashes = getGeohashesInBounds({
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    }, 8, 200); // Level 8, max 200 cells like hashstr.com

    console.log(`Generated ${hashes.length} geohash cells`);
    setGeohashes(hashes);
  }, [map]);

  useEffect(() => {
    updateGeohashes();
  }, [updateGeohashes]);

  useMapEvents({
    moveend: updateGeohashes,
    zoomend: updateGeohashes
  });

  return (
    <>
      {geohashes.map((hash) => {
        try {
          const bounds = getGeohashBounds(hash);
          const positions: [number, number][] = [
            [bounds.minLat, bounds.minLng], // SW
            [bounds.minLat, bounds.maxLng], // SE
            [bounds.maxLat, bounds.maxLng], // NE
            [bounds.maxLat, bounds.minLng], // NW
          ];

          const isSelected = hash === selectedHash;

          return (
            <Polygon
              key={hash}
              positions={positions}
              pathOptions={{
                color: isSelected ? '#4ade80' : '#60a5fa',
                weight: isSelected ? 2 : 0.5,
                opacity: isSelected ? 1 : 0.7,
                fillColor: isSelected ? '#4ade80' : '#60a5fa',
                fillOpacity: isSelected ? 0.3 : 0.05
              }}
              eventHandlers={{
                click: () => onCellClick(hash),
                mouseover: (e) => {
                  if (!isSelected) {
                    e.target.setStyle({ fillOpacity: 0.2, weight: 1.5 });
                  }
                },
                mouseout: (e) => {
                  if (!isSelected) {
                    e.target.setStyle({ fillOpacity: 0.05, weight: 0.5 });
                  }
                }
              }}
            >
              <Tooltip
                permanent
                direction="center"
                className={isSelected ? 'geohash-label-selected' : 'geohash-label'}
              >
                {hash}
              </Tooltip>
            </Polygon>
          );
        } catch (e) {
          console.warn('Failed to render geohash cell:', hash, e);
          return null;
        }
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
    console.log('Map cell clicked:', hash);
    setGeohashInput(hash);
    setSelectedGeohash(hash);
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="real">
              <Navigation className="h-4 w-4 mr-2" />
              Real GPS
            </TabsTrigger>
            <TabsTrigger value="map">
              <Hash className="h-4 w-4 mr-2" />
              Geohash + Map
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

          {/* Combined Geohash + Map Tab */}
          <TabsContent value="map" className="space-y-4">
            {/* Geohash Input at top */}
            <div className="space-y-2">
              <Label htmlFor="geohash-input" className="flex items-center justify-between">
                <span>Enter Geohash (Level 8)</span>
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
                className={`font-mono text-lg ${
                  status.valid
                    ? 'border-green-500 focus-visible:ring-green-500'
                    : geohashInput.length > 8
                    ? 'border-red-500'
                    : ''
                }`}
              />
              <p className="text-xs text-muted-foreground">
                Type or click map cells • Level 8 covers ~38m × 19m area
              </p>
            </div>

            {/* Map with Grid */}
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
                <GeohashGridOverlay
                  onCellClick={handleMapCellClick}
                  selectedHash={selectedGeohash}
                />
              </MapContainer>
            </div>

            {/* Override Button */}
            <Button
              onClick={handleOverrideWithGeohash}
              className="w-full"
              size="lg"
              disabled={!selectedGeohash}
            >
              <MapPin className="h-5 w-5 mr-2" />
              {selectedGeohash ? `Override with ${selectedGeohash}` : 'Override Location'}
            </Button>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
