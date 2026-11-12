const PALETTES = [
  ['#7c6cff', '#4f46e5'],
  ['#22d3ee', '#0ea5e9'],
  ['#f472b6', '#db2777'],
  ['#34d399', '#059669'],
  ['#fbbf24', '#d97706'],
  ['#a78bfa', '#7c3aed'],
  ['#fb7185', '#e11d48'],
  ['#38bdf8', '#2563eb'],
  ['#2dd4bf', '#0d9488'],
  ['#c084fc', '#9333ea'],
] as const;

export function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function paletteFor(value: string): readonly [string, string] {
  return PALETTES[hashString(value) % PALETTES.length];
}

export function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function avatarGradient(value: string): string {
  const [from, to] = paletteFor(value);
  return `linear-gradient(135deg, ${from}, ${to})`;
}

export function channelAccent(value: string): string {
  const [from, to] = paletteFor(value);
  return `${from}33`;
}
