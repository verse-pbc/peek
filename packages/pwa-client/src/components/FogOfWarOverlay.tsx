import React, { useRef, useEffect } from 'react';
import { LatLng, Map as LeafletMap } from 'leaflet';

interface FogPoint {
  lat: number;
  lng: number;
  radiusMeters: number;
}

interface FogOfWarOverlayProps {
  map: LeafletMap | null;
  points: FogPoint[];
  fogOpacity?: number;
  fogColor?: string;
}

export const FogOfWarOverlay: React.FC<FogOfWarOverlayProps> = ({
  map,
  points,
  fogOpacity = 0.7,
  fogColor = '#000000'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!map || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const updateCanvas = () => {
      const container = map.getContainer();
      const { width, height } = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Set canvas dimensions
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Update canvas style dimensions
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Clear and fill with fog
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = fogColor + Math.round(fogOpacity * 255).toString(16).padStart(2, '0');
      ctx.fillRect(0, 0, width, height);

      // Punch holes for each point
      ctx.globalCompositeOperation = 'destination-out';

      points.forEach(point => {
        const latlng = new LatLng(point.lat, point.lng);
        const pixelPoint = map.latLngToContainerPoint(latlng);

        // Calculate pixel radius based on current zoom
        const metersPerPixel = 40075016.686 * Math.abs(Math.cos(latlng.lat * Math.PI / 180)) / Math.pow(2, map.getZoom() + 8);
        const pixelRadius = point.radiusMeters / metersPerPixel;

        // Create gradient for soft edges
        const gradient = ctx.createRadialGradient(
          pixelPoint.x, pixelPoint.y, 0,
          pixelPoint.x, pixelPoint.y, pixelRadius
        );

        // Fully transparent in center, fading to opaque at edges
        gradient.addColorStop(0, 'rgba(0,0,0,1)');
        gradient.addColorStop(0.7, 'rgba(0,0,0,0.8)');
        gradient.addColorStop(0.9, 'rgba(0,0,0,0.3)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pixelPoint.x, pixelPoint.y, pixelRadius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Reset composite operation
      ctx.globalCompositeOperation = 'source-over';
    };

    // Initial draw
    updateCanvas();

    // Update on map events
    const handleUpdate = () => updateCanvas();
    map.on('move', handleUpdate);
    map.on('zoom', handleUpdate);
    map.on('resize', handleUpdate);

    return () => {
      map.off('move', handleUpdate);
      map.off('zoom', handleUpdate);
      map.off('resize', handleUpdate);
    };
  }, [map, points, fogOpacity, fogColor]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 500
      }}
    />
  );
};