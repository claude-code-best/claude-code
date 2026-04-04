import * as React from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  getAllOutputStyles,
  OUTPUT_STYLE_CONFIG,
  type OutputStyleConfig,
} from '../constants/outputStyles.js'
import { Box, Text } from '../ink.js'
import type { OutputStyle } from '../utils/config.js'
import { getCwd } from '../utils/cwd.js'
import type { OptionWithDescription } from './CustomSelect/select.js'
import { Select } from './CustomSelect/select.js'
import { Dialog } from './design-system/Dialog.js'

const DEFAULT_OUTPUT_STYLE_LABEL = 'Default'
const DEFAULT_OUTPUT_STYLE_DESCRIPTION =
  'Claude completes coding tasks efficiently and provides concise responses'

function mapConfigsToOptions(styles: {
  [styleName: string]: OutputStyleConfig | null
}): OptionWithDescription[] {
  return Object.entries(styles).map(([style, config]) => ({
    label: config?.name ?? DEFAULT_OUTPUT_STYLE_LABEL,
    value: style,
    description: config?.description ?? DEFAULT_OUTPUT_STYLE_DESCRIPTION,
  }))
}

export type OutputStylePickerProps = {
  initialStyle: OutputStyle
  onComplete: (style: OutputStyle) => void
  onCancel: () => void
  isStandaloneCommand?: boolean
}

export function OutputStylePicker({
  initialStyle,
  onComplete,
  onCancel,
  isStandaloneCommand,
}: OutputStylePickerProps): React.ReactNode {
  const [styleOptions, setStyleOptions] = useState<OptionWithDescription[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load all output styles including custom ones
    getAllOutputStyles(getCwd())
      .then(allStyles => {
        const options = mapConfigsToOptions(allStyles)
        setStyleOptions(options)
        setIsLoading(false)
      })
      .catch(() => {
        // On error, fall back to built-in styles only
        const builtInOptions = mapConfigsToOptions(OUTPUT_STYLE_CONFIG)
        setStyleOptions(builtInOptions)
        setIsLoading(false)
      })
  }, [])

  const handleStyleSelect = useCallback(
    (style: string) => {
      const outputStyle = style as OutputStyle
      onComplete(outputStyle)
    },
    [onComplete],
  )

  return (
    <Dialog
      title="Preferred output style"
      onCancel={onCancel}
      hideInputGuide={!isStandaloneCommand}
      hideBorder={!isStandaloneCommand}
    >
      <Box flexDirection="column" gap={1}>
        <Box marginTop={1}>
          <Text dimColor>
            This changes how Claude Code communicates with you
          </Text>
        </Box>
        {isLoading ? (
          <Text dimColor>Loading output styles…</Text>
        ) : (
          <Select
            options={styleOptions}
            onChange={handleStyleSelect}
            visibleOptionCount={10}
            defaultValue={initialStyle}
          />
        )}
      </Box>
    </Dialog>
  )
}
