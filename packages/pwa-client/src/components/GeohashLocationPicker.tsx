import React, { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';
import { MapPin, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import {
  validateGeohash,
  geohashToLatLng,
  latLngToGeohash,
  getGeohashBounds,
  getGeohashesInBounds,
  getGeohashNeighbors
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
  selectedHash,
  precision,
  showValidationArea,
  onZoomChange
}: {
  onCellClick: (hash: string) => void;
  selectedHash: string | null;
  precision: number;
  showValidationArea: boolean;
  onZoomChange: (zoom: number) => void;
}) {
  const [geohashes, setGeohashes] = useState<string[]>([]);
  const map = useMap();

  const updateGeohashes = useCallback((currentPrecision: number) => {
    const bounds = map.getBounds();
    const mapBounds = {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    };

    const hashes = getGeohashesInBounds(mapBounds, currentPrecision, 200);
    console.log(`Zoom ${map.getZoom().toFixed(1)} → Precision ${currentPrecision} → ${hashes.length} cells`);
    setGeohashes(hashes);
  }, [map]);

  useEffect(() => {
    updateGeohashes(precision);
  }, [updateGeohashes, precision]);

  useMapEvents({
    moveend: () => updateGeohashes(precision),
    zoomend: () => {
      const zoom = map.getZoom();
      onZoomChange(zoom);
      updateGeohashes(precision);
    }
  });

  return (
    <>
      {geohashes.map((hash) => {
        try {
          const bbox = getGeohashBounds(hash);
          // Leaflet Polygon expects [[lat, lng], [lat, lng], ...]
          // Create rectangle: SW -> SE -> NE -> NW -> SW (close polygon)
          const positions: [number, number][] = [
            [bbox.minLat, bbox.minLng], // SW corner
            [bbox.minLat, bbox.maxLng], // SE corner
            [bbox.maxLat, bbox.maxLng], // NE corner
            [bbox.maxLat, bbox.minLng], // NW corner
            [bbox.minLat, bbox.minLng], // Close polygon back to SW
          ];

          const isSelected = hash === selectedHash;

          // Check if this cell is in the valid area (center + 8 neighbors)
          // Only show validation area at precision 8
          let isValidNeighbor = false;
          if (selectedHash && showValidationArea) {
            const validCells = getGeohashNeighbors(selectedHash);
            isValidNeighbor = validCells.includes(hash) && !isSelected;
          }

          // Color scheme:
          // - Center cell (selected): bright green
          // - 8 neighbor cells: light green (valid join area)
          // - Other cells: blue
          const getStyle = () => {
            if (isSelected) {
              return {
                color: '#10b981',
                weight: 2,
                opacity: 1,
                fillColor: '#10b981',
                fillOpacity: 0.4
              };
            } else if (isValidNeighbor) {
              return {
                color: '#86efac',
                weight: 1,
                opacity: 0.8,
                fillColor: '#86efac',
                fillOpacity: 0.2
              };
            } else {
              return {
                color: '#60a5fa',
                weight: 0.5,
                opacity: 0.7,
                fillColor: '#60a5fa',
                fillOpacity: 0.05
              };
            }
          };

          return (
            <Polygon
              key={hash}
              positions={positions}
              pathOptions={getStyle()}
              eventHandlers={{
                click: () => {
                  console.log('Polygon clicked:', hash, 'bounds:', bbox);
                  onCellClick(hash);
                },
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

// Calculate geohash precision based on zoom level (matches hashstr.com)
const getPrecisionForZoom = (zoom: number): number => {
  if (zoom < 3) return 1;
  if (zoom < 6) return 2;
  if (zoom < 9) return 3;
  if (zoom < 12) return 4;
  if (zoom < 15) return 5;
  if (zoom < 18) return 6;
  if (zoom < 20) return 7;
  return 8; // Peek validation level
};

export const GeohashLocationPicker: React.FC<GeohashLocationPickerProps> = ({
  onLocationSelected,
  initialLocation
}) => {
  const { toast } = useToast();
  const [geohashInput, setGeohashInput] = useState('');
  const [selectedGeohash, setSelectedGeohash] = useState<string | null>(null);
  const [isLoadingGPS, setIsLoadingGPS] = useState(true);
  const [mapCenter, setMapCenter] = useState<[number, number]>([37.7749, -122.4194]);
  const [currentZoom, setCurrentZoom] = useState(20);
  const [currentPrecision, setCurrentPrecision] = useState(8);

  // Get user's real GPS location and pre-select their geohash
  useEffect(() => {
    if (initialLocation) {
      setMapCenter([initialLocation.latitude, initialLocation.longitude]);
      const userHash = latLngToGeohash(initialLocation.latitude, initialLocation.longitude, 8);
      setGeohashInput(userHash);
      setSelectedGeohash(userHash);
      setIsLoadingGPS(false);
      return;
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setMapCenter([lat, lng]);

          // Calculate and pre-select user's level 8 geohash
          const userHash = latLngToGeohash(lat, lng, 8);
          setGeohashInput(userHash);
          setSelectedGeohash(userHash);
          setIsLoadingGPS(false);

          console.log(`Pre-selected user's geohash: ${userHash} at ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        },
        (error) => {
          console.warn('GPS error, using default location:', error);
          // Fallback to SF
          setMapCenter([37.7749, -122.4194]);
          setIsLoadingGPS(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setIsLoadingGPS(false);
    }
  }, [initialLocation]);


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
          Your current location is pre-selected (green = valid join area). Click any cell or type a geohash to test a different location.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingGPS && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription>
              Getting your GPS location...
            </AlertDescription>
          </Alert>
        )}

        {/* Geohash Input */}
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
            className={`font-mono text-lg ${
              status.valid
                ? 'border-green-500 focus-visible:ring-green-500'
                : geohashInput.length > 8
                ? 'border-red-500'
                : ''
            }`}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {currentPrecision === 8
                ? 'Green area = valid join zone (center + 8 neighbors)'
                : `Zoom: ${currentZoom.toFixed(1)} • Precision: ${currentPrecision}/8 • Zoom in to see validation area`}
            </span>
          </div>
        </div>

        {/* Map with Grid */}
        <div className="h-96 w-full rounded-lg overflow-hidden border">
          {isLoadingGPS ? (
            <div className="h-full flex items-center justify-center bg-muted">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <MapContainer
              center={mapCenter}
              zoom={20}
              className="h-full w-full"
              zoomControl={true}
              minZoom={1}
              maxZoom={21}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <GeohashGridOverlay
                onCellClick={handleMapCellClick}
                selectedHash={selectedGeohash}
                precision={currentPrecision}
                showValidationArea={currentPrecision === 8}
                onZoomChange={(zoom) => {
                  setCurrentZoom(zoom);
                  const newPrecision = getPrecisionForZoom(zoom);
                  setCurrentPrecision(newPrecision);
                }}
              />
            </MapContainer>
          )}
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
      </CardContent>
    </Card>
  );
};
