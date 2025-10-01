import geohash from 'ngeohash';

const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeohashBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * Validate if a string is a valid geohash
 */
export function validateGeohash(hash: string): boolean {
  if (!hash || hash.length === 0) return false;

  // Check if all characters are valid base32
  return hash.split('').every(char => GEOHASH_BASE32.includes(char.toLowerCase()));
}

/**
 * Decode geohash to lat/lng center point
 */
export function geohashToLatLng(hash: string): LatLng {
  const decoded = geohash.decode(hash);
  return {
    lat: decoded.latitude,
    lng: decoded.longitude
  };
}

/**
 * Encode lat/lng to geohash at specified precision
 */
export function latLngToGeohash(lat: number, lng: number, precision: number = 8): string {
  return geohash.encode(lat, lng, precision);
}

/**
 * Get bounding box for a geohash
 */
export function getGeohashBounds(hash: string): GeohashBounds {
  if (!hash || !validateGeohash(hash)) {
    throw new Error(`Invalid geohash: ${hash}`);
  }
  const bbox = geohash.decode_bbox(hash);
  return {
    minLat: bbox[0],
    minLng: bbox[1],
    maxLat: bbox[2],
    maxLng: bbox[3]
  };
}

/**
 * Get all neighboring geohashes (8 surrounding + center = 9 total)
 */
export function getGeohashNeighbors(hash: string): string[] {
  const neighbors = geohash.neighbors(hash);
  return [
    neighbors.n,
    neighbors.ne,
    neighbors.e,
    neighbors.se,
    neighbors.s,
    neighbors.sw,
    neighbors.w,
    neighbors.nw,
    hash // Include center
  ];
}

/**
 * Generate all level 8 geohashes visible in map bounds
 * Returns array limited to maxCells to prevent performance issues
 */
export function getGeohashesInBounds(
  bounds: { north: number; south: number; east: number; west: number },
  precision: number = 8,
  maxCells: number = 100
): string[] {
  const hashes: Set<string> = new Set();

  // Sample points across the viewport
  const latStep = (bounds.north - bounds.south) / 10;
  const lngStep = (bounds.east - bounds.west) / 10;

  for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
    for (let lng = bounds.west; lng <= bounds.east; lng += lngStep) {
      try {
        const hash = latLngToGeohash(lat, lng, precision);
        if (hash && validateGeohash(hash)) {
          hashes.add(hash);

          // Also add neighbors to ensure full coverage
          try {
            const neighbors = getGeohashNeighbors(hash);
            neighbors.forEach(n => {
              if (n && validateGeohash(n)) {
                hashes.add(n);
              }
            });
          } catch (e) {
            console.warn('Failed to get neighbors for hash:', hash, e);
          }
        }

        if (hashes.size >= maxCells) {
          return Array.from(hashes).filter(h => h && validateGeohash(h)).slice(0, maxCells);
        }
      } catch (e) {
        console.warn('Failed to encode geohash for', lat, lng, e);
      }
    }
  }

  return Array.from(hashes).filter(h => h && validateGeohash(h));
}

/**
 * Get the 4 corners of a geohash cell as [lat, lng] pairs
 * Returns in order: SW, SE, NE, NW for drawing polygons
 */
export function getGeohashCorners(hash: string): [number, number][] {
  const bounds = getGeohashBounds(hash);
  return [
    [bounds.minLat, bounds.minLng], // SW
    [bounds.minLat, bounds.maxLng], // SE
    [bounds.maxLat, bounds.maxLng], // NE
    [bounds.maxLat, bounds.minLng], // NW
  ];
}
