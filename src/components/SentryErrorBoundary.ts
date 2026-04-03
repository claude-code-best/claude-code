import * as React from 'react'
import { captureException } from 'src/utils/sentry.js'

interface Props {
  children: React.ReactNode
  /** Optional label for identifying which component boundary caught the error */
  name?: string
}

interface State {
  hasError: boolean
}

export class SentryErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    captureException(error, {
      componentBoundary: this.props.name || 'SentryErrorBoundary',
      componentStack: errorInfo.componentStack,
    })
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return null
    }

    return this.props.children
  }
}
