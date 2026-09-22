import { Component } from 'react'
import { AlertOctagon, RotateCcw } from 'lucide-react'

/**
 * Keeps one failing widget from blanking the whole dashboard.
 *
 * This matters more here than in a normal app: if a chart throws while a
 * caregiver is watching, the right outcome is a broken chart next to working
 * vitals, not a white screen that hides a critical alert.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Dashboard component crashed:', error, info)
  }

  render() {
    const { error } = this.state
    const { children, label = 'This panel' } = this.props

    if (!error) return children

    return (
      <div className="card border-status-critical/25 bg-status-critical/[0.05] p-5">
        <div className="flex items-start gap-3">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-status-critical" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-status-critical">
              {label} could not be displayed
            </h3>
            <p className="mt-1 break-words text-[12px] text-slate-400">
              {error.message || String(error)}
            </p>
            <p className="mt-2 text-[11.5px] text-slate-500">
              The rest of the dashboard is still live and still alerting.
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="btn-ghost mt-3 !py-1.5 !text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
