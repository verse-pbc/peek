import React, { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, Popup } from 'react-leaflet';
import { LatLng, Icon } from 'leaflet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { MapPin, Crosshair, Navigation2, Copy, Check, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet's default icon issue with webpack
interface LeafletIconPrototype {
  _getIconUrl?: () => string;
}
delete (Icon.Default.prototype as LeafletIconPrototype)._getIconUrl;
Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface ForceLocationMapProps {
  onLocationSelected: (location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  }) => void;
  initialLocation?: { latitude: number; longitude: number };
}

// Component to handle map clicks and update marker position
function LocationSelector({
  setPosition
}: {
  setPosition: (pos: LatLng) => void;
}) {
  const map = useMapEvents({
    click(e) {
      setPosition(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });

  return null;
}

export const ForceLocationMap: React.FC<ForceLocationMapProps> = ({
  onLocationSelected,
  initialLocation
}) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState(10);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);

  // Load saved location from localStorage or use initial location
  useEffect(() => {
    setIsLoadingLocation(true);
    const saved = localStorage.getItem('peek_test_location');
    if (saved) {
      try {
        const { lat, lng } = JSON.parse(saved);
        const newPos = new LatLng(lat, lng);
        setPosition(newPos);
        setManualLat(lat.toString());
        setManualLng(lng.toString());
        setIsLoadingLocation(false);
      } catch (e) {
        console.error('Failed to parse saved location:', e);
        setIsLoadingLocation(false);
      }
    } else if (initialLocation) {
      const newPos = new LatLng(initialLocation.latitude, initialLocation.longitude);
      setPosition(newPos);
      setManualLat(initialLocation.latitude.toString());
      setManualLng(initialLocation.longitude.toString());
      setIsLoadingLocation(false);
    } else {
      // Try to get current location first, fallback to San Francisco
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const newPos = new LatLng(pos.coords.latitude, pos.coords.longitude);
            setPosition(newPos);
            setManualLat(pos.coords.latitude.toString());
            setManualLng(pos.coords.longitude.toString());
            setAccuracy(Math.round(pos.coords.accuracy));
            setIsLoadingLocation(false);
          },
          (error) => {
            console.log('Could not get current location, using default:', error);
            // Fallback to San Francisco
            const defaultPos = new LatLng(37.7749, -122.4194);
            setPosition(defaultPos);
            setManualLat('37.7749');
            setManualLng('-122.4194');
            setIsLoadingLocation(false);
          },
          { enableHighAccuracy: false, timeout: 5000 }
        );
      } else {
        // No geolocation available, use San Francisco
        const defaultPos = new LatLng(37.7749, -122.4194);
        setPosition(defaultPos);
        setManualLat('37.7749');
        setManualLng('-122.4194');
        setIsLoadingLocation(false);
      }
    }
  }, [initialLocation]);

  // Update manual inputs when position changes from map click
  useEffect(() => {
    if (position) {
      setManualLat(position.lat.toFixed(6));
      setManualLng(position.lng.toFixed(6));
    }
  }, [position]);

  const handleManualUpdate = useCallback(() => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (!isNaN(lat) && !isNaN(lng)) {
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        const newPos = new LatLng(lat, lng);
        setPosition(newPos);
      } else {
        toast({
          title: "Invalid coordinates",
          description: "Latitude must be between -90 and 90, longitude between -180 and 180",
          variant: "destructive"
        });
      }
    }
  }, [manualLat, manualLng, toast]);

  const handleUseLocation = useCallback(() => {
    if (position) {
      const location = {
        latitude: position.lat,
        longitude: position.lng,
        accuracy,
        timestamp: Math.floor(Date.now() / 1000) // Convert to seconds for Nostr
      };

      // Save to localStorage for persistence
      localStorage.setItem('peek_test_location', JSON.stringify({
        lat: position.lat,
        lng: position.lng
      }));

      onLocationSelected(location);

      toast({
        title: "Test location set",
        description: `GPS override: ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)} (will be validated)`,
      });
    }
  }, [position, accuracy, onLocationSelected, toast]);

  const handleCopyCoordinates = useCallback(() => {
    if (position) {
      navigator.clipboard.writeText(`${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: "Coordinates copied to clipboard",
      });
    }
  }, [position, toast]);

  const handleGetCurrentLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos = new LatLng(pos.coords.latitude, pos.coords.longitude);
          setPosition(newPos);
          setAccuracy(Math.round(pos.coords.accuracy));
          toast({
            title: "Location found",
            description: `Your current location has been set on the map`,
          });
        },
        (error) => {
          toast({
            title: "Location error",
            description: error.message,
            variant: "destructive"
          });
        },
        { enableHighAccuracy: true }
      );
    }
  }, [toast]);

  const handleClearCache = useCallback(() => {
    localStorage.removeItem('peek_test_location');
    toast({
      title: "Cache cleared",
      description: "Test location has been removed from storage",
    });

    // Reset to current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos = new LatLng(pos.coords.latitude, pos.coords.longitude);
          setPosition(newPos);
          setAccuracy(Math.round(pos.coords.accuracy));
        },
        () => {
          // Fallback to San Francisco if location fails
          const defaultPos = new LatLng(37.7749, -122.4194);
          setPosition(defaultPos);
          setManualLat('37.7749');
          setManualLng('-122.4194');
        }
      );
    }
  }, [toast]);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Force Test Location
        </CardTitle>
        <CardDescription>
          Click on the map or enter coordinates to override GPS location for testing. The location will still be validated by the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Map */}
        <div className="relative">
          <div className="h-96 w-full rounded-lg overflow-hidden border">
            {isLoadingLocation ? (
              <div className="h-full w-full flex items-center justify-center bg-muted">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Detecting your location...</p>
                </div>
              </div>
            ) : position ? (
              <MapContainer
                center={position}
                zoom={16}
                className="h-full w-full"
                zoomControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationSelector setPosition={setPosition} />
                <Marker position={position}>
                  <Popup>
                    Test Location<br />
                    Lat: {position.lat.toFixed(6)}<br />
                    Lng: {position.lng.toFixed(6)}
                  </Popup>
                </Marker>
              </MapContainer>
            ) : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="absolute top-2 right-2 z-[1000]"
            onClick={handleGetCurrentLocation}
          >
            <Crosshair className="h-4 w-4 mr-1" />
            My Location
          </Button>
        </div>

        {/* Manual coordinate inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="lat">Latitude</Label>
            <Input
              id="lat"
              type="text"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              placeholder="37.7749"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lng">Longitude</Label>
            <Input
              id="lng"
              type="text"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              placeholder="-122.4194"
            />
          </div>
        </div>

        {/* Accuracy slider */}
        <div className="space-y-2">
          <Label htmlFor="accuracy">
            GPS Accuracy: {accuracy}m
          </Label>
          <input
            id="accuracy"
            type="range"
            min="1"
            max="100"
            value={accuracy}
            onChange={(e) => setAccuracy(parseInt(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Lower values simulate better GPS accuracy
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleManualUpdate} variant="outline">
            <Navigation2 className="h-4 w-4 mr-2" />
            Update from inputs
          </Button>
          <Button onClick={handleCopyCoordinates} variant="outline" disabled={!position}>
            {copied ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {copied ? 'Copied!' : 'Copy coordinates'}
          </Button>
          <Button onClick={handleClearCache} variant="outline">
            <Trash2 className="h-4 w-4 mr-2" />
            Clear cache
          </Button>
        </div>

        {/* Use location button */}
        <Button
          onClick={handleUseLocation}
          className="w-full"
          disabled={!position}
          variant="default"
        >
          <MapPin className="h-4 w-4 mr-2" />
          Override GPS with this location
        </Button>

        {/* Current selection display */}
        {position && (
          <div className="bg-muted p-3 rounded-lg text-sm font-mono">
            📍 Selected: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
            <br />
            🎯 Accuracy: {accuracy}m
          </div>
        )}
      </CardContent>
    </Card>
  );
};