/**
 * Frontend QR Sticker Generator
 *
 * Generates Peek community stickers with QR codes entirely in the browser.
 * No backend needed - works offline in PWA mode.
 */

import QRCode from 'qrcode';

/**
 * Generate a styled Peek sticker SVG with QR code
 *
 * @param communityId Optional community UUID. If not provided, generates a new one.
 * @returns Object with SVG string, community ID, and URL
 */
export async function generateStickerSVG(communityId?: string): Promise<{
  svg: string;
  communityId: string;
  url: string;
}> {
  // Generate UUID if not provided
  const uuid = communityId || crypto.randomUUID();
  const url = `https://peek.verse.app/c/${uuid}`;

  // Generate QR code as SVG (without wrapper)
  const qrSvg = await QRCode.toString(url, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 260,
    color: {
      dark: '#2C3E50',
      light: '#FFFFFF',
    },
  });

  // Extract just the path data from qrcode's SVG
  // qrcode library wraps in <svg>, we need just the inner content
  const qrPathMatch = qrSvg.match(/<path[^>]*d="([^"]+)"[^>]*\/>/);
  const qrPath = qrPathMatch ? qrPathMatch[0] : '';

  // Create styled sticker SVG matching backend design
  const styledSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="480" viewBox="0 0 400 480">
  <defs>
    <!-- Background gradient: cream to white -->
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#FAF5F0;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#FFFFFF;stop-opacity:1" />
    </linearGradient>

    <!-- Drop shadow for QR container -->
    <filter id="shadow">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.1"/>
    </filter>
  </defs>

  <!-- Background with gradient -->
  <rect width="400" height="480" rx="24" fill="url(#bgGradient)"/>

  <!-- White container for QR code with shadow -->
  <rect x="70" y="60" width="260" height="260" rx="12" fill="#FFFFFF" filter="url(#shadow)"/>

  <!-- QR code -->
  <g transform="translate(70, 60)">
    <svg viewBox="0 0 260 260" width="260" height="260">
      ${qrPath}
    </svg>
  </g>

  <!-- "PEEK" text label -->
  <text
    x="200"
    y="370"
    text-anchor="middle"
    font-family="system-ui, -apple-system, 'Segoe UI', sans-serif"
    font-size="42"
    font-weight="700"
    fill="#2C3E50"
    letter-spacing="2"
  >PEEK</text>

  <!-- Mint accent line -->
  <rect x="160" y="382" width="80" height="4" rx="2" fill="#4ECDC4"/>
</svg>`;

  return {
    svg: styledSvg,
    communityId: uuid,
    url,
  };
}

/**
 * Download sticker as SVG file
 * SVG is preferred for print as it's vector-based (infinite resolution)
 */
export function downloadStickerSVG(svg: string, filename?: string): void {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `peek-sticker-${Date.now()}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up
  URL.revokeObjectURL(url);
}

/**
 * Download sticker as PNG file (rasterized for compatibility)
 *
 * @param svg SVG string to convert
 * @param scale Scale factor for print quality (5 = 2000x2400px at 300 DPI)
 * @param filename Optional filename
 */
export async function downloadStickerPNG(
  svg: string,
  scale: number = 5,
  filename?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    // Set canvas size for print quality
    canvas.width = 400 * scale;  // 2000px at 5x
    canvas.height = 480 * scale; // 2400px at 5x

    // Create image from SVG
    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      // Draw scaled image to canvas
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Convert to PNG blob
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create PNG blob'));
          return;
        }

        // Download PNG
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = filename || `peek-sticker-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up
        URL.revokeObjectURL(url);
        URL.revokeObjectURL(pngUrl);
        resolve();
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG image'));
    };

    img.src = url;
  });
}

/**
 * Get sticker as data URL for preview/display
 */
export function getStickerDataURL(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
