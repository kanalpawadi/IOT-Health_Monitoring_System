import { motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

/**
 * A sliding two-position switch rather than a single icon button: the current
 * theme stays visible at a glance, which is what you want on a wall display
 * someone walks up to.
 */
export default function ThemeToggle({ className = '' }) {
  const { theme, setTheme } = useTheme()

  const options = [
    { key: 'dark', icon: Moon, label: 'Dark theme' },
    { key: 'light', icon: Sun, label: 'Milky white theme' },
  ]

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className={`relative inline-flex items-center gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-0.5 ${className}`}
    >
      {options.map(({ key, icon: Icon, label }) => {
        const active = theme === key
        return (
          <button
            key={key}
            onClick={() => setTheme(key)}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className="relative grid h-7 w-8 place-items-center rounded-[10px] transition-colors"
          >
            {active && (
              <motion.span
                layoutId="theme-pill"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-[10px] bg-white/[0.10]"
              />
            )}
            <Icon
              className={`relative h-[15px] w-[15px] transition-colors ${
                active ? 'text-accent' : 'text-slate-600 hover:text-slate-400'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
