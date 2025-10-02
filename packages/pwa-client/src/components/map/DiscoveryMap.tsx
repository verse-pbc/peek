import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { LatLng, Map as LeafletMap } from 'leaflet';
import { FogOfWarOverlay } from '@/components/FogOfWarOverlay';
import { DiscoveryMap as IDiscoveryMap } from '@/services/discovery-service';
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

const FOG_RADIUS_METERS = 1000;

interface DiscoveryMapComponentProps {
  discoveryMap: IDiscoveryMap | null;
  fogEnabled: boolean;
  mapCenter: LatLng;
  flyToLocation: LatLng | null;
}

// Component to manage the fog overlay and handle map location updates
function MapManager({
  discoveryMap,
  fogEnabled,
  flyToLocation
}: {
  discoveryMap: IDiscoveryMap | null;
  fogEnabled: boolean;
  flyToLocation: LatLng | null;
}) {
  const map = useMap();
  const [leafletMap, setLeafletMap] = useState<LeafletMap | null>(null);

  useEffect(() => {
    setLeafletMap(map);
  }, [map]);

  // Handle flying to a new location
  useEffect(() => {
    if (flyToLocation && map) {
      map.flyTo(flyToLocation, 15, {
        duration: 1.5
      });
    }
  }, [flyToLocation, map]);

  const fogPoints = discoveryMap?.points.map(point => ({
    lat: point.lat,
    lng: point.lng,
    radiusMeters: FOG_RADIUS_METERS
  })) || [];

  return fogEnabled ? (
    <FogOfWarOverlay
      map={leafletMap}
      points={fogPoints}
      fogOpacity={0.65}
      fogColor="#2C3E50"
    />
  ) : null;
}

export function DiscoveryMapComponent({
  discoveryMap,
  fogEnabled,
  mapCenter,
  flyToLocation
}: DiscoveryMapComponentProps) {
  return (
    <div className="h-[50vh] md:h-96 relative">
      <MapContainer
        center={mapCenter}
        zoom={13}
        className="h-full w-full"
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapManager
          discoveryMap={discoveryMap}
          fogEnabled={fogEnabled}
          flyToLocation={flyToLocation}
        />
      </MapContainer>
    </div>
  );
}
