/**
 * Original vector illustrations, authored for this project.
 *
 * They are SVG rather than raster images on purpose: they recolour themselves
 * from the theme tokens, stay crisp on a projector at the demo, and add about
 * 4 KB to the bundle instead of several hundred. Nothing here is stock art, so
 * there is no attribution or licensing question for your report.
 */

import { useThemeColors } from '../context/ThemeContext'

/* ------------------------------------------------------------------ hero */

/**
 * A patient wearing the sensor node, with the signal propagating outward into
 * the cloud and back as a waveform. Used as the artwork on the hero panel.
 */
export function MonitoringScene({ className = '', animated = true }) {
  const c = useThemeColors()

  return (
    <svg
      viewBox="0 0 320 200"
      className={className}
      role="img"
      aria-label="A patient wearing a sensor node streaming vitals to the cloud"
    >
      <defs>
        <linearGradient id="ms-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.accent} stopOpacity="0.30" />
          <stop offset="100%" stopColor={c.accent} stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="ms-wave" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={c.hr} stopOpacity="0" />
          <stop offset="30%" stopColor={c.hr} stopOpacity="0.95" />
          <stop offset="100%" stopColor={c.spo2} stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="ms-halo">
          <stop offset="0%" stopColor={c.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={c.accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="96" cy="104" r="74" fill="url(#ms-halo)" />

      {/* concentric transmission arcs */}
      {[34, 48, 62].map((r, i) => (
        <circle
          key={r}
          cx="96"
          cy="100"
          r={r}
          fill="none"
          stroke={c.accent}
          strokeOpacity={0.30 - i * 0.08}
          strokeWidth="1.2"
          strokeDasharray="3 7"
        >
          {animated && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 96 100`}
              to={`${i % 2 ? -360 : 360} 96 100`}
              dur={`${26 + i * 9}s`}
              repeatCount="indefinite"
            />
          )}
        </circle>
      ))}

      {/* patient: head and shoulders */}
      <circle cx="96" cy="78" r="17" fill="url(#ms-body)" stroke={c.accent} strokeOpacity="0.55" strokeWidth="1.4" />
      <path
        d="M66 136c0-18 13.4-29 30-29s30 11 30 29v8H66z"
        fill="url(#ms-body)"
        stroke={c.accent}
        strokeOpacity="0.55"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {/* wrist sensor node */}
      <g>
        <rect x="116" y="114" width="17" height="12" rx="3.5" fill={c.hr} fillOpacity="0.22" stroke={c.hr} strokeWidth="1.3" />
        <circle cx="124.5" cy="120" r="2.6" fill={c.hr}>
          {animated && (
            <animate attributeName="opacity" values="1;0.25;1" dur="1.15s" repeatCount="indefinite" />
          )}
        </circle>
      </g>

      {/* cloud */}
      <g transform="translate(214 44)">
        <path
          d="M14 30a13 13 0 011.6-25.9A17 17 0 0148 8.2 11.5 11.5 0 0146.5 30z"
          fill={c.spo2}
          fillOpacity="0.14"
          stroke={c.spo2}
          strokeOpacity="0.6"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </g>

      {/* uplink packets */}
      {animated &&
        [0, 1, 2].map((i) => (
          <circle key={i} r="2.4" fill={c.spo2}>
            <animateMotion
              path="M134 110 C 176 100, 196 84, 224 72"
              dur="2.6s"
              begin={`${i * 0.85}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;1;1;0"
              dur="2.6s"
              begin={`${i * 0.85}s`}
              repeatCount="indefinite"
            />
          </circle>
        ))}

      {/* returned waveform */}
      <path
        d="M196 138 h14 l4-13 l6 26 l5-19 l4 6 h16 l4-9 l5 15 l4-6 h44"
        fill="none"
        stroke="url(#ms-wave)"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {animated && (
          <animate
            attributeName="stroke-dashoffset"
            from="300"
            to="0"
            dur="3.2s"
            repeatCount="indefinite"
          />
        )}
      </path>
    </svg>
  )
}

/* ---------------------------------------------------------- empty states */

/** Calm, reassuring artwork for "no alerts". */
export function AllClearArt({ className = '' }) {
  const c = useThemeColors()

  return (
    <svg viewBox="0 0 160 120" className={className} role="img" aria-label="No alerts">
      <defs>
        <linearGradient id="ac-shield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.normal} stopOpacity="0.26" />
          <stop offset="100%" stopColor={c.normal} stopOpacity="0.04" />
        </linearGradient>
      </defs>

      {[30, 42].map((r, i) => (
        <circle
          key={r}
          cx="80"
          cy="58"
          r={r}
          fill="none"
          stroke={c.normal}
          strokeOpacity={0.18 - i * 0.07}
          strokeWidth="1"
          strokeDasharray="2 6"
        />
      ))}

      <path
        d="M80 28l20 7v20c0 15-8.6 26-20 31-11.4-5-20-16-20-31V35z"
        fill="url(#ac-shield)"
        stroke={c.normal}
        strokeOpacity="0.65"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M70 58l7.5 7.5L92 51"
        fill="none"
        stroke={c.normal}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24 100h28l4-8 5 16 4-8h42"
        fill="none"
        stroke={c.normal}
        strokeOpacity="0.4"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Artwork for "no readings yet" / sensor not reporting. */
export function AwaitingSignalArt({ className = '' }) {
  const c = useThemeColors()

  return (
    <svg viewBox="0 0 160 120" className={className} role="img" aria-label="Waiting for readings">
      <rect
        x="52" y="34" width="56" height="44" rx="7"
        fill={c.muted} fillOpacity="0.10"
        stroke={c.muted} strokeOpacity="0.45" strokeWidth="1.5"
      />
      <rect x="62" y="46" width="36" height="3" rx="1.5" fill={c.muted} fillOpacity="0.4" />
      <rect x="62" y="55" width="24" height="3" rx="1.5" fill={c.muted} fillOpacity="0.28" />
      <circle cx="80" cy="69" r="3" fill={c.muted} fillOpacity="0.45">
        <animate attributeName="opacity" values="0.2;1;0.2" dur="1.8s" repeatCount="indefinite" />
      </circle>

      {[16, 24, 32].map((r, i) => (
        <path
          key={r}
          d={`M118 56a${r} ${r} 0 000-${r * 0.72}`}
          transform={`translate(0 ${r * 0.36})`}
          fill="none"
          stroke={c.accent}
          strokeOpacity={0.5 - i * 0.13}
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <animate
            attributeName="opacity"
            values="0.15;1;0.15"
            dur="1.9s"
            begin={`${i * 0.3}s`}
            repeatCount="indefinite"
          />
        </path>
      ))}

      <path
        d="M34 96h92"
        stroke={c.muted}
        strokeOpacity="0.28"
        strokeWidth="1.5"
        strokeDasharray="4 6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Decorative orb behind the AI summary card. */
export function AiOrb({ className = '' }) {
  const c = useThemeColors()

  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="orb-core">
          <stop offset="0%" stopColor={c.move} stopOpacity="0.55" />
          <stop offset="60%" stopColor={c.move} stopOpacity="0.12" />
          <stop offset="100%" stopColor={c.move} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#orb-core)" />
      {[0, 60, 120].map((rot) => (
        <ellipse
          key={rot}
          cx="60" cy="60" rx="46" ry="17"
          fill="none"
          stroke={c.move}
          strokeOpacity="0.30"
          strokeWidth="1"
          transform={`rotate(${rot} 60 60)`}
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`${rot} 60 60`}
            to={`${rot + 360} 60 60`}
            dur="22s"
            repeatCount="indefinite"
          />
        </ellipse>
      ))}
    </svg>
  )
}
