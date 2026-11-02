import { mock } from 'bun:test'
import * as React from 'react'

mock.module('@anthropic/ink', () => ({
  Box: (p: any) => React.createElement('box', p),
  Pane: (p: any) => React.createElement('pane', p),
  Text: (p: any) => React.createElement('text', p),
  useTheme: () => ['dark', () => {}],
}))
