export interface StreamTheme {
  id: string;
  name: string;
  isPremium: boolean;
  colors: { primary: string; secondary: string; text: string; accent: string };
}

export const STREAM_THEMES: StreamTheme[] = [
  { id: 'classic', name: 'Classic', isPremium: false, colors: { primary: '#1a6fa8', secondary: '#0d2137', text: '#ffffff', accent: '#4ade80' } },
  { id: 'modern', name: 'Modern', isPremium: false, colors: { primary: '#16a34a', secondary: '#0a1628', text: '#ffffff', accent: '#facc15' } },
  { id: 'dark', name: 'Dark', isPremium: false, colors: { primary: '#374151', secondary: '#111827', text: '#ffffff', accent: '#f87171' } },
  { id: 'minimal', name: 'Minimal', isPremium: false, colors: { primary: '#ffffff', secondary: '#f3f4f6', text: '#111827', accent: '#3b82f6' } },
  { id: 'ipl', name: 'IPL Style', isPremium: true, colors: { primary: '#c9a000', secondary: '#1a1a2e', text: '#ffffff', accent: '#e94560' } },
  { id: 'international', name: 'International', isPremium: true, colors: { primary: '#003f87', secondary: '#ffffff', text: '#111827', accent: '#c8102e' } },
  { id: 'neon', name: 'Neon Theme', isPremium: true, colors: { primary: '#00ffcc', secondary: '#0a0a0a', text: '#00ffcc', accent: '#ff00ff' } },
  { id: 'gradient', name: 'Gradient Theme', isPremium: true, colors: { primary: '#8b5cf6', secondary: '#3b82f6', text: '#ffffff', accent: '#f59e0b' } },
  { id: 'glass', name: 'Glass Theme', isPremium: true, colors: { primary: 'rgba(255,255,255,0.15)', secondary: 'rgba(0,0,0,0.4)', text: '#ffffff', accent: '#60a5fa' } },
];

export const getTheme = (id: string): StreamTheme =>
  STREAM_THEMES.find((t) => t.id === id) ?? STREAM_THEMES[0];