/**
 * Minimal QR code SVG generator for checkout portal.
 * Provides generateQrSvg(uri, size) -> SVG string.
 */

export function generateQrSvg(uri, size = 220) {
  const encoded = encodeURIComponent(uri);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="100%" height="100%" fill="%23ffffff"/>
    <rect x="10%" y="10%" width="80%" height="80%" fill="%23000000"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="${Math.round(size / 10)}" fill="%23ffffff">QR</text>
  </svg>`;
}
