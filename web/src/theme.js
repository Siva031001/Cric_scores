// Hand-ported from src/utils/streamThemes.ts, keeping identical ids/colors so
// a match's chosen streamThemeId (set in-app via ThemeSelectorScreen) looks
// the same on the OBS overlay as it does on the in-app LiveScoreOverlay.
export const THEMES = {
  classic: { name: 'Classic', primary: '#1a6fa8', secondary: '#0d2137', text: '#ffffff', accent: '#4ade80' },
  modern: { name: 'Modern', primary: '#16a34a', secondary: '#0a1628', text: '#ffffff', accent: '#facc15' },
  dark: { name: 'Dark', primary: '#374151', secondary: '#111827', text: '#ffffff', accent: '#f87171' },
  minimal: { name: 'Minimal', primary: '#ffffff', secondary: '#f3f4f6', text: '#111827', accent: '#3b82f6' },
  ipl: { name: 'IPL Style', primary: '#c9a000', secondary: '#1a1a2e', text: '#ffffff', accent: '#e94560' },
  international: { name: 'International', primary: '#003f87', secondary: '#ffffff', text: '#111827', accent: '#c8102e' },
  neon: { name: 'Neon Theme', primary: '#00ffcc', secondary: '#0a0a0a', text: '#00ffcc', accent: '#ff00ff' },
  gradient: { name: 'Gradient Theme', primary: '#8b5cf6', secondary: '#3b82f6', text: '#ffffff', accent: '#f59e0b' },
  glass: { name: 'Glass Theme', primary: 'rgba(255,255,255,0.15)', secondary: 'rgba(0,0,0,0.4)', text: '#ffffff', accent: '#60a5fa' },
};

export const getTheme = (id) => THEMES[id] ?? THEMES.classic;
