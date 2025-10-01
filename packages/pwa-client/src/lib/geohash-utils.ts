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
  return [
    geohash.neighbor(hash, [1, 0]),   // north
    geohash.neighbor(hash, [1, 1]),   // northeast
    geohash.neighbor(hash, [0, 1]),   // east
    geohash.neighbor(hash, [-1, 1]),  // southeast
    geohash.neighbor(hash, [-1, 0]),  // south
    geohash.neighbor(hash, [-1, -1]), // southwest
    geohash.neighbor(hash, [0, -1]),  // west
    geohash.neighbor(hash, [1, -1]),  // northwest
    hash // center
  ];
}

/**
 * Generate all geohashes visible in map bounds
 * Algorithm matches hashstr.com implementation
 */
export function getGeohashesInBounds(
  bounds: { north: number; south: number; east: number; west: number },
  precision: number = 8,
  maxCells: number = 200
): string[] {
  const hashes: Set<string> = new Set();

  try {
    // Get corner geohashes
    const sw = latLngToGeohash(bounds.south, bounds.west, precision);
    const ne = latLngToGeohash(bounds.north, bounds.east, precision);

    if (!sw || !ne) return [];

    // Get bounds of corner cells
    const swBounds = getGeohashBounds(sw);
    const neBounds = getGeohashBounds(ne);

    // Calculate cell dimensions
    const cellWidth = swBounds.maxLng - swBounds.minLng;
    const cellHeight = swBounds.maxLat - swBounds.minLat;

    // Generate grid by stepping through cells
    let cellCount = 0;
    for (let lat = swBounds.minLat; lat <= neBounds.maxLat + cellHeight && cellCount < maxCells; lat += cellHeight * 0.99) {
      for (let lng = swBounds.minLng; lng <= neBounds.maxLng + cellWidth && cellCount < maxCells; lng += cellWidth * 0.99) {
        try {
          const hash = latLngToGeohash(lat, lng, precision);
          if (hash && validateGeohash(hash)) {
            const hashBounds = getGeohashBounds(hash);
            // Check if this geohash intersects with viewport
            if (hashBounds.maxLat >= bounds.south && hashBounds.minLat <= bounds.north &&
                hashBounds.maxLng >= bounds.west && hashBounds.minLng <= bounds.east) {
              hashes.add(hash);
              cellCount++;
            }
          }
        } catch {
          // Skip invalid cells
        }
      }
    }

    return Array.from(hashes);
  } catch (e) {
    console.error('Failed to generate geohash grid:', e);
    return [];
  }
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
