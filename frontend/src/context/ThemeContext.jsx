import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'vitalstream-theme'

/** CSS custom properties the charts and inline SVG styles need as real values. */
const COLOR_VARS = {
  hr: '--c-vital-hr',
  spo2: '--c-vital-spo2',
  temp: '--c-vital-temp',
  move: '--c-vital-move',
  accent: '--c-accent',
  normal: '--c-status-normal',
  warning: '--c-status-warning',
  critical: '--c-status-critical',
  grid: '--grid-line',
  text: '--c-t200',
  muted: '--c-t500',
}

function readColors() {
  if (typeof window === 'undefined') return {}
  const style = getComputedStyle(document.documentElement)
  const out = {}
  for (const [name, varName] of Object.entries(COLOR_VARS)) {
    const raw = style.getPropertyValue(varName).trim()
    // Tokens are "R G B" triples; --grid-line is already a full colour.
    out[name] = /^[\d\s]+$/.test(raw) ? `rgb(${raw})` : raw
  }
  return out
}

function initialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* private mode or blocked storage: fall through to the OS preference */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme)
  const [colors, setColors] = useState({})

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* not fatal: the theme still applies for this session */
    }
    // Read after the attribute lands so the new palette is what we measure.
    const id = requestAnimationFrame(() => setColors(readColors()))
    return () => cancelAnimationFrame(id)
  }, [theme])

  const toggle = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  const value = useMemo(
    () => ({ theme, setTheme, toggle, colors, isLight: theme === 'light' }),
    [theme, toggle, colors],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}

/** Theme-aware colours for charts and inline SVG, with dark-theme fallbacks. */
export function useThemeColors() {
  const { colors } = useTheme()
  return useMemo(
    () => ({
      hr: colors.hr || '#f43f5e',
      spo2: colors.spo2 || '#06b6d4',
      temp: colors.temp || '#f59e0b',
      move: colors.move || '#a78bfa',
      accent: colors.accent || '#06b6d4',
      normal: colors.normal || '#10b981',
      warning: colors.warning || '#f59e0b',
      critical: colors.critical || '#ef4444',
      grid: colors.grid || 'rgba(255,255,255,0.05)',
      text: colors.text || '#e2e8f0',
      muted: colors.muted || '#64748b',
    }),
    [colors],
  )
}
