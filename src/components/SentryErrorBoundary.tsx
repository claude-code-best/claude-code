import * as React from 'react';
import { Box, Text } from '@anthropic/ink';
import { captureException } from 'src/utils/sentry.js';
import { logError } from 'src/utils/log.js';

interface Props {
  children: React.ReactNode;
  /** Optional label for identifying which component boundary caught the error */
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class SentryErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Pick<State, 'hasError' | 'error'> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });

    // Log to stderr so the diagnostic info is visible even in production builds
    const boundary = this.props.name || 'SentryErrorBoundary';
    const lines = ['', `[ErrorBoundary:${boundary}] React rendering error caught`, `  Message: ${error.message}`];
    if (errorInfo.componentStack) {
      lines.push(`  Component stack:\n${errorInfo.componentStack}`);
    }
    // eslint-disable-next-line no-console -- intentional stderr diagnostic output
    console.error(lines.join('\n'));

    logError(error);
    captureException(error, {
      componentBoundary: boundary,
      componentStack: errorInfo.componentStack,
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Box flexDirection="column" paddingX={1} paddingY={1}>
          <Text color="error" bold>
            React Rendering Error
          </Text>
          <Text color="error">{this.state.error?.message}</Text>
          {this.props.name && <Text dimColor>Boundary: {this.props.name}</Text>}
        </Box>
      );
    }

    return this.props.children;
  }
}
