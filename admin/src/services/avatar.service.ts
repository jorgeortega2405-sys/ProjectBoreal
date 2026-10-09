const GRADIENT_PALETTES = [
  ['#1e293b', '#0f172a'],
  ['#3b82f6', '#1d4ed8'],
  ['#6366f1', '#4338ca'],
  ['#8b5cf6', '#6d28d9'],
  ['#ec4899', '#be185d'],
  ['#059669', '#047857'],
  ['#d97706', '#b45309'],
  ['#0891b2', '#0e7490'],
  ['#475569', '#334155'],
  ['#18181b', '#27272a'],
];

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getInitial(name: string): string {
  const clean = String(name || '').trim().replace(/^[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/, '');
  if (!clean) return 'U';
  return clean.charAt(0).toUpperCase();
}

export function generateAvatarSvg(name: string, sizeInput?: number): string {
  const initial = escapeXml(getInitial(name));
  const hash = Math.floor(Math.abs(hashString(name))) || 0;
  const palette = GRADIENT_PALETTES[hash % GRADIENT_PALETTES.length];
  const [color1, color2] = palette;

  const size = Math.min(Math.max(Number(sizeInput) || 80, 32), 256);
  const fontSize = Math.round(size * 0.44);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="avatar-grad-${hash}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${color1}" />
      <stop offset="100%" stop-color="${color2}" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size / 2}" fill="url(#avatar-grad-${hash})" />
  <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSize}" font-weight="600" fill="#ffffff" letter-spacing="-0.5">${initial}</text>
</svg>`;
}
