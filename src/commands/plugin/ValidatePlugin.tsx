import figures from 'figures'
import * as React from 'react'
import { useEffect } from 'react'
import { Box, Text } from '@anthropic/ink'
import { errorMessage } from '../../utils/errors.js'
import { logError } from '../../utils/log.js'
import { validateManifest } from '../../utils/plugins/validatePlugin.js'
import { plural } from '../../utils/stringUtils.js'

type Props = {
  onComplete: (result?: string) => void
  path?: string
}

export function ValidatePlugin({ onComplete, path }: Props): React.ReactNode {
  useEffect(() => {
    async function runValidation() {
      // If no path provided, show usage
      if (!path) {
        onComplete(
          'Usage: /plugin validate <path>\n\n' +
            'Validate a plugin or marketplace manifest file or directory.\n\n' +
            'Examples:\n' +
            '  /plugin validate .claude-plugin/plugin.json\n' +
            '  /plugin validate /path/to/plugin-directory\n' +
            '  /plugin validate .\n\n' +
            'When given a directory, automatically validates .claude-plugin/marketplace.json\n' +
            'or .claude-plugin/plugin.json (prefers marketplace if both exist).\n\n' +
            'Or from the command line:\n' +
            '  claude plugin validate <path>',
        )
        return
      }

      try {
        const result = await validateManifest(path)

        let output = ''

        // Add header
        output += `Validating ${result.fileType} manifest: ${result.filePath}\n\n`

        // Show errors
        if (result.errors.length > 0) {
          output += `${figures.cross} Found ${result.errors.length} ${plural(result.errors.length, 'error')}:\n\n`

          result.errors.forEach(error => {
            output += `  ${figures.pointer} ${error.path}: ${error.message}\n`
          })

          output += '\n'
        }

        // Show warnings
        if (result.warnings.length > 0) {
          output += `${figures.warning} Found ${result.warnings.length} ${plural(result.warnings.length, 'warning')}:\n\n`

          result.warnings.forEach(warning => {
            output += `  ${figures.pointer} ${warning.path}: ${warning.message}\n`
          })

          output += '\n'
        }

        // Show success or failure
        if (result.success) {
          if (result.warnings.length > 0) {
            output += `${figures.tick} Validation passed with warnings\n`
          } else {
            output += `${figures.tick} Validation passed\n`
          }

          // Exit with code 0 (success)
          process.exitCode = 0
        } else {
          output += `${figures.cross} Validation failed\n`

          // Exit with code 1 (validation failure)
          process.exitCode = 1
        }

        onComplete(output)
      } catch (error) {
        // Exit with code 2 (unexpected error)
        process.exitCode = 2

        logError(error)

        onComplete(
          `${figures.cross} Unexpected error during validation: ${errorMessage(error)}`,
        )
      }
    }

    void runValidation()
  }, [onComplete, path])

  return (
    <Box flexDirection="column">
      <Text>Running validation...</Text>
    </Box>
  )
}
