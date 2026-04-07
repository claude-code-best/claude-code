import React, { useMemo } from 'react'
import { Box, Text, useTheme } from '@anthropic/ink'
import { WebFetchTool } from '../../../tools/WebFetchTool/WebFetchTool.js'
import { shouldShowAlwaysAllowOptions } from '../../../utils/permissions/permissionsLoader.js'
import {
  type OptionWithDescription,
  Select,
} from '../../CustomSelect/select.js'
import { type UnaryEvent, usePermissionRequestLogging } from '../hooks.js'
import { PermissionDialog } from '../PermissionDialog.js'
import type { PermissionRequestProps } from '../PermissionRequest.js'
import { PermissionRuleExplanation } from '../PermissionRuleExplanation.js'
import { logUnaryPermissionEvent } from '../utils.js'

function inputToPermissionRuleContent(input: { [k: string]: unknown }): string {
  try {
    const parsedInput = WebFetchTool.inputSchema.safeParse(input)
    if (!parsedInput.success) {
      return `input:${input.toString()}`
    }
    const { url } = parsedInput.data
    const hostname = new URL(url).hostname
    return `domain:${hostname}`
  } catch {
    return `input:${input.toString()}`
  }
}

export function WebFetchPermissionRequest({
  toolUseConfirm,
  onDone,
  onReject,
  verbose,
  workerBadge,
}: PermissionRequestProps): React.ReactNode {
  const [theme] = useTheme()
  // url is already validated by the input schema
  const { url } = toolUseConfirm.input as { url: string }

  // Extract hostname from URL
  const hostname = new URL(url).hostname

  const unaryEvent = useMemo<UnaryEvent>(
    () => ({ completion_type: 'tool_use_single', language_name: 'none' }),
    [],
  )

  usePermissionRequestLogging(toolUseConfirm, unaryEvent)

  // Generate permission options specific to domains
  const showAlwaysAllowOptions = shouldShowAlwaysAllowOptions()
  const options = useMemo((): OptionWithDescription<string>[] => {
    const result: OptionWithDescription<string>[] = [
      {
        label: 'Yes',
        value: 'yes',
      },
    ]

    if (showAlwaysAllowOptions) {
      result.push({
        label: (
          <Text>
            Yes, and don&apos;t ask again for <Text bold>{hostname}</Text>
          </Text>
        ),
        value: 'yes-dont-ask-again-domain',
      })
    }

    result.push({
      label: (
        <Text>
          No, and tell Claude what to do differently <Text bold>(esc)</Text>
        </Text>
      ),
      value: 'no',
    })

    return result
  }, [hostname, showAlwaysAllowOptions])

  function onChange(newValue: string) {
    switch (newValue) {
      case 'yes':
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
        toolUseConfirm.onAllow(toolUseConfirm.input, [])
        onDone()
        break
      case 'yes-dont-ask-again-domain': {
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
        const ruleContent = inputToPermissionRuleContent(toolUseConfirm.input)
        const ruleValue = {
          toolName: toolUseConfirm.tool.name,
          ruleContent,
        }

        // Pass permission update directly to onAllow
        toolUseConfirm.onAllow(toolUseConfirm.input, [
          {
            type: 'addRules',
            rules: [ruleValue],
            behavior: 'allow',
            destination: 'localSettings',
          },
        ])
        onDone()
        break
      }
      case 'no':
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'reject')
        toolUseConfirm.onReject()
        onReject()
        onDone()
        break
    }
  }

  return (
    <PermissionDialog title="Fetch" workerBadge={workerBadge}>
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>
          {WebFetchTool.renderToolUseMessage(
            toolUseConfirm.input as { url: string; prompt: string },
            {
              theme,
              verbose,
            },
          )}
        </Text>
        <Text dimColor>{toolUseConfirm.description}</Text>
      </Box>

      <Box flexDirection="column">
        <PermissionRuleExplanation
          permissionResult={toolUseConfirm.permissionResult}
          toolType="tool"
        />
        <Text>Do you want to allow Claude to fetch this content?</Text>
        <Select
          options={options}
          onChange={onChange}
          onCancel={() => onChange('no')}
        />
      </Box>
    </PermissionDialog>
  )
}
