import React, { useState, useEffect } from 'react'
import { Text } from '../index.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/**
 * A simple animated spinner for loading states.
 */
export function Spinner(): React.ReactNode {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => (f + 1) % FRAMES.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])

  return <Text>{FRAMES[frame]}</Text>
}
