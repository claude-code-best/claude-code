import type {
  ElicitRequestFormParams,
  ElicitRequestURLParams,
  ElicitResult,
  PrimitiveSchemaDefinition,
} from '@modelcontextprotocol/sdk/types.js'
import figures from 'figures'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRegisterOverlay } from '../../context/overlayContext.js'
import { useNotifyAfterTimeout } from '../../hooks/useNotifyAfterTimeout.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- raw text input for elicitation form
import { Box, Text, useInput } from '@anthropic/ink'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import type { ElicitationRequestEvent } from '../../services/mcp/elicitationHandler.js'
import { openBrowser } from '../../utils/browser.js'
import {
  getEnumLabel,
  getEnumValues,
  getMultiSelectLabel,
  getMultiSelectValues,
  isDateTimeSchema,
  isEnumSchema,
  isMultiSelectEnumSchema,
  validateElicitationInput,
  validateElicitationInputAsync,
} from '../../utils/mcp/elicitationValidation.js'
import { plural } from '../../utils/stringUtils.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink'
import TextInput from '../TextInput.js'

type Props = {
  event: ElicitationRequestEvent
  onResponse: (
    action: ElicitResult['action'],
    content?: ElicitResult['content'],
  ) => void
  /** Called when the phase 2 waiting state is dismissed (URL elicitations only). */
  onWaitingDismiss?: (action: 'dismiss' | 'retry' | 'cancel') => void
}

const isTextField = (s: PrimitiveSchemaDefinition) =>
  ['string', 'number', 'integer'].includes(s.type)

const RESOLVING_SPINNER_CHARS =
  '\u280B\u2819\u2839\u2838\u283C\u2834\u2826\u2827\u2807\u280F'
const advanceSpinnerFrame = (f: number) =>
  (f + 1) % RESOLVING_SPINNER_CHARS.length

/** Timer callback for enumTypeaheadRef — module-scope to avoid closure capture. */
function resetTypeahead(ta: {
  buffer: string
  timer: ReturnType<typeof setTimeout> | undefined
}): void {
  ta.buffer = ''
  ta.timer = undefined
}

/**
 * Isolated spinner glyph for a field that is being resolved asynchronously.
 * Owns its own 80ms animation timer so ticks only re-render this tiny leaf,
 * not the entire ElicitationFormDialog (~1200 lines + renderFormFields).
 * Mounted/unmounted by the parent via the `isResolving` condition.
 *
 * Not using the shared <Spinner /> from ../Spinner.js: that one renders in a
 * <Box width={2}> with color="text", which would break the 1-col checkbox
 * column alignment here (other checkbox states are width-1 glyphs).
 */
function ResolvingSpinner(): React.ReactNode {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const timer = setInterval(setFrame, 80, advanceSpinnerFrame)
    return () => clearInterval(timer)
  }, [])
  return <Text color="warning">{RESOLVING_SPINNER_CHARS[frame]}</Text>
}

/** Format an ISO date/datetime for display, keeping the ISO value for submission. */
function formatDateDisplay(
  isoValue: string,
  schema: PrimitiveSchemaDefinition,
): string {
  try {
    const date = new Date(isoValue)
    if (Number.isNaN(date.getTime())) return isoValue
    const format = 'format' in schema ? schema.format : undefined
    if (format === 'date-time') {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    }
    // date-only: parse as local date to avoid timezone shift
    const parts = isoValue.split('-')
    if (parts.length === 3) {
      const local = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]),
      )
      return local.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    }
    return isoValue
  } catch {
    return isoValue
  }
}

export function ElicitationDialog({
  event,
  onResponse,
  onWaitingDismiss,
}: Props): React.ReactNode {
  if (event.params.mode === 'url') {
    return (
      <ElicitationURLDialog
        event={event}
        onResponse={onResponse}
        onWaitingDismiss={onWaitingDismiss}
      />
    )
  }

  return <ElicitationFormDialog event={event} onResponse={onResponse} />
}

function ElicitationFormDialog({
  event,
  onResponse,
}: {
  event: ElicitationRequestEvent
  onResponse: Props['onResponse']
}): React.ReactNode {
  const { serverName, signal } = event
  const request = event.params as ElicitRequestFormParams
  const { message, requestedSchema } = request
  const hasFields = Object.keys(requestedSchema.properties).length > 0
  const [focusedButton, setFocusedButton] = useState<
    'accept' | 'decline' | null
  >(hasFields ? null : 'accept')
  const [formValues, setFormValues] = useState<
    Record<string, string | number | boolean | string[]>
  >(() => {
    const initialValues: Record<string, string | number | boolean | string[]> =
      {}
    if (requestedSchema.properties) {
      for (const [propName, propSchema] of Object.entries(
        requestedSchema.properties,
      )) {
        if (typeof propSchema === 'object' && propSchema !== null) {
          if (propSchema.default !== undefined) {
            initialValues[propName] = propSchema.default
          }
        }
      }
    }
    return initialValues
  })

  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >(() => {
    const initialErrors: Record<string, string> = {}
    for (const [propName, propSchema] of Object.entries(
      requestedSchema.properties,
    )) {
      if (isTextField(propSchema) && propSchema?.default !== undefined) {
        const validation = validateElicitationInput(
          String(propSchema.default),
          propSchema,
        )
        if (!validation.isValid && validation.error) {
          initialErrors[propName] = validation.error
        }
      }
    }
    return initialErrors
  })

  useEffect(() => {
    if (!signal) return

    const handleAbort = () => {
      onResponse('cancel')
    }

    if (signal.aborted) {
      handleAbort()
      return
    }

    signal.addEventListener('abort', handleAbort)
    return () => {
      signal.removeEventListener('abort', handleAbort)
    }
  }, [signal, onResponse])

  const schemaFields = useMemo(() => {
    const requiredFields = requestedSchema.required ?? []
    return Object.entries(requestedSchema.properties).map(([name, schema]) => ({
      name,
      schema,
      isRequired: requiredFields.includes(name),
    }))
  }, [requestedSchema])

  const [currentFieldIndex, setCurrentFieldIndex] = useState<
    number | undefined
  >(hasFields ? 0 : undefined)
  const [textInputValue, setTextInputValue] = useState(() => {
    // Initialize from the first field's value if it's a text field
    const firstField = schemaFields[0]
    if (firstField && isTextField(firstField.schema)) {
      const val = formValues[firstField.name]
      if (val === undefined) return ''
      return String(val)
    }
    return ''
  })
  const [textInputCursorOffset, setTextInputCursorOffset] = useState(
    textInputValue.length,
  )
  const [resolvingFields, setResolvingFields] = useState<Set<string>>(
    () => new Set(),
  )
  // Accordion state (shared by multi-select and single-select enum)
  const [expandedAccordion, setExpandedAccordion] = useState<
    string | undefined
  >()
  const [accordionOptionIndex, setAccordionOptionIndex] = useState(0)

  const dateDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const resolveAbortRef = useRef<Map<string, AbortController>>(new Map())
  const enumTypeaheadRef = useRef({
    buffer: '',
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  })

  // Clear pending debounce/typeahead timers and abort in-flight async
  // validations on unmount so they don't fire against an unmounted component
  // (e.g. dialog dismissed mid-debounce or mid-resolve).
  useEffect(
    () => () => {
      if (dateDebounceRef.current !== undefined) {
        clearTimeout(dateDebounceRef.current)
      }
      const ta = enumTypeaheadRef.current
      if (ta.timer !== undefined) {
        clearTimeout(ta.timer)
      }
      for (const controller of resolveAbortRef.current.values()) {
        controller.abort()
      }
      resolveAbortRef.current.clear()
    },
    [],
  )

  const { columns, rows } = useTerminalSize()

  const currentField =
    currentFieldIndex !== undefined
      ? schemaFields[currentFieldIndex]
      : undefined
  const currentFieldIsText =
    currentField !== undefined &&
    isTextField(currentField.schema) &&
    !isEnumSchema(currentField.schema)

  // Text fields are always in edit mode when focused — no Enter-to-edit step.
  const isEditingTextField = currentFieldIsText && !focusedButton

  useRegisterOverlay('elicitation')
  useNotifyAfterTimeout('Claude Code needs your input', 'elicitation_dialog')

  // Sync textInputValue when the focused field changes
  const syncTextInput = useCallback(
    (fieldIndex: number | undefined) => {
      if (fieldIndex === undefined) {
        setTextInputValue('')
        setTextInputCursorOffset(0)
        return
      }
      const field = schemaFields[fieldIndex]
      if (field && isTextField(field.schema) && !isEnumSchema(field.schema)) {
        const val = formValues[field.name]
        const text = val !== undefined ? String(val) : ''
        setTextInputValue(text)
        setTextInputCursorOffset(text.length)
      }
    },
    [schemaFields, formValues],
  )

  function validateMultiSelect(
    fieldName: string,
    schema: PrimitiveSchemaDefinition,
  ) {
    if (!isMultiSelectEnumSchema(schema)) return
    const selected = (formValues[fieldName] as string[] | undefined) ?? []
    const fieldRequired =
      schemaFields.find(f => f.name === fieldName)?.isRequired ?? false
    const min = schema.minItems
    const max = schema.maxItems
    // Skip minItems check when field is optional and unset
    if (
      min !== undefined &&
      selected.length < min &&
      (selected.length > 0 || fieldRequired)
    ) {
      updateValidationError(
        fieldName,
        `Select at least ${min} ${plural(min, 'item')}`,
      )
    } else if (max !== undefined && selected.length > max) {
      updateValidationError(
        fieldName,
        `Select at most ${max} ${plural(max, 'item')}`,
      )
    } else {
      updateValidationError(fieldName)
    }
  }

  function handleNavigation(direction: 'up' | 'down'): void {
    // Collapse accordion and validate on navigate away
    if (currentField && isMultiSelectEnumSchema(currentField.schema)) {
      validateMultiSelect(currentField.name, currentField.schema)
      setExpandedAccordion(undefined)
    } else if (currentField && isEnumSchema(currentField.schema)) {
      setExpandedAccordion(undefined)
    }

    // Commit current text field before navigating away
    if (isEditingTextField && currentField) {
      commitTextField(currentField.name, currentField.schema, textInputValue)

      // Cancel any pending debounce — we're resolving now on navigate-away
      if (dateDebounceRef.current !== undefined) {
        clearTimeout(dateDebounceRef.current)
        dateDebounceRef.current = undefined
      }

      // For date/datetime fields that failed sync validation, try async NL parsing
      if (
        isDateTimeSchema(currentField.schema) &&
        textInputValue.trim() !== '' &&
        validationErrors[currentField.name]
      ) {
        resolveFieldAsync(
          currentField.name,
          currentField.schema,
          textInputValue,
        )
      }
    }

    // Fields + accept + decline
    const itemCount = schemaFields.length + 2
    const index =
      currentFieldIndex ??
      (focusedButton === 'accept'
        ? schemaFields.length
        : focusedButton === 'decline'
          ? schemaFields.length + 1
          : undefined)
    const nextIndex =
      index !== undefined
        ? (index + (direction === 'up' ? itemCount - 1 : 1)) % itemCount
        : 0
    if (nextIndex < schemaFields.length) {
      setCurrentFieldIndex(nextIndex)
      setFocusedButton(null)
      syncTextInput(nextIndex)
    } else {
      setCurrentFieldIndex(undefined)
      setFocusedButton(nextIndex === schemaFields.length ? 'accept' : 'decline')
      setTextInputValue('')
    }
  }

  function setField(
    fieldName: string,
    value: number | string | boolean | string[] | undefined,
  ) {
    setFormValues(prev => {
      const next = { ...prev }
      if (value === undefined) {
        delete next[fieldName]
      } else {
        next[fieldName] = value
      }
      return next
    })
    // Clear "required" error when a value is provided
    if (
      value !== undefined &&
      validationErrors[fieldName] === 'This field is required'
    ) {
      updateValidationError(fieldName)
    }
  }

  function updateValidationError(fieldName: string, error?: string) {
    setValidationErrors(prev => {
      const next = { ...prev }
      if (error) {
        next[fieldName] = error
      } else {
        delete next[fieldName]
      }
      return next
    })
  }

  function unsetField(fieldName: string) {
    if (!fieldName) return
    setField(fieldName, undefined)
    updateValidationError(fieldName)
    setTextInputValue('')
    setTextInputCursorOffset(0)
  }

  function commitTextField(
    fieldName: string,
    schema: PrimitiveSchemaDefinition,
    value: string,
  ) {
    const trimmedValue = value.trim()

    // Empty input for non-plain-string types means unset
    if (
      trimmedValue === '' &&
      (schema.type !== 'string' ||
        ('format' in schema && schema.format !== undefined))
    ) {
      unsetField(fieldName)
      return
    }

    if (trimmedValue === '') {
      // Empty plain string — keep or unset depending on whether it was set
      if (formValues[fieldName] !== undefined) {
        setField(fieldName, '')
      }
      return
    }

    const validation = validateElicitationInput(value, schema)
    setField(fieldName, validation.isValid ? validation.value : value)
    updateValidationError(
      fieldName,
      validation.isValid ? undefined : validation.error,
    )
  }

  function resolveFieldAsync(
    fieldName: string,
    schema: PrimitiveSchemaDefinition,
    rawValue: string,
  ) {
    if (!signal) return

    // Abort any existing resolution for this field
    const existing = resolveAbortRef.current.get(fieldName)
    if (existing) {
      existing.abort()
    }

    const controller = new AbortController()
    resolveAbortRef.current.set(fieldName, controller)

    setResolvingFields(prev => new Set(prev).add(fieldName))

    void validateElicitationInputAsync(
      rawValue,
      schema,
      controller.signal,
    ).then(
      result => {
        resolveAbortRef.current.delete(fieldName)
        setResolvingFields(prev => {
          const next = new Set(prev)
          next.delete(fieldName)
          return next
        })
        if (controller.signal.aborted) return

        if (result.isValid) {
          setField(fieldName, result.value)
          updateValidationError(fieldName)
          // Update the text input if we're still on this field
          const isoText = String(result.value)
          setTextInputValue(prev => {
            // Only replace if the field is still showing the raw input
            if (prev === rawValue) {
              setTextInputCursorOffset(isoText.length)
              return isoText
            }
            return prev
          })
        } else {
          // Keep raw text, show validation error
          updateValidationError(fieldName, result.error)
        }
      },
      () => {
        resolveAbortRef.current.delete(fieldName)
        setResolvingFields(prev => {
          const next = new Set(prev)
          next.delete(fieldName)
          return next
        })
      },
    )
  }

  function handleTextInputChange(newValue: string) {
    setTextInputValue(newValue)
    // Commit immediately on each keystroke (sync validation)
    if (currentField) {
      commitTextField(currentField.name, currentField.schema, newValue)

      // For date/datetime fields, debounce async NL parsing after 2s of inactivity
      if (dateDebounceRef.current !== undefined) {
        clearTimeout(dateDebounceRef.current)
        dateDebounceRef.current = undefined
      }
      if (
        isDateTimeSchema(currentField.schema) &&
        newValue.trim() !== '' &&
        validationErrors[currentField.name]
      ) {
        const fieldName = currentField.name
        const schema = currentField.schema
        dateDebounceRef.current = setTimeout(
          (dateDebounceRef, resolveFieldAsync, fieldName, schema, newValue) => {
            dateDebounceRef.current = undefined
            resolveFieldAsync(fieldName, schema, newValue)
          },
          2000,
          dateDebounceRef,
          resolveFieldAsync,
          fieldName,
          schema,
          newValue,
        )
      }
    }
  }

  function handleTextInputSubmit() {
    handleNavigation('down')
  }

  /**
   * Append a keystroke to the typeahead buffer (reset after 2s idle) and
   * call `onMatch` with the index of the first label that prefix-matches.
   * Shared by boolean y/n, enum accordion, and multi-select accordion.
   */
  function runTypeahead(
    char: string,
    labels: string[],
    onMatch: (index: number) => void,
  ) {
    const ta = enumTypeaheadRef.current
    if (ta.timer !== undefined) clearTimeout(ta.timer)
    ta.buffer += char.toLowerCase()
    ta.timer = setTimeout(resetTypeahead, 2000, ta)
    const match = labels.findIndex(l => l.startsWith(ta.buffer))
    if (match !== -1) onMatch(match)
  }

  // Esc while a field is focused: cancel the dialog.
  // Uses Settings context (escape-only, no 'n' key) since Dialog's
  // Confirmation-context cancel is suppressed when a field is focused.
  useKeybinding(
    'confirm:no',
    () => {
      // For text fields, revert uncommitted changes first
      if (isEditingTextField && currentField) {
        const val = formValues[currentField.name]
        setTextInputValue(val !== undefined ? String(val) : '')
        setTextInputCursorOffset(0)
      }
      onResponse('cancel')
    },
    {
      context: 'Settings',
      isActive: !!currentField && !focusedButton && !expandedAccordion,
    },
  )

  useInput(
    (_input, key) => {
      // Text fields handle their own character input; we only intercept
      // navigation keys and backspace-on-empty here.
      if (
        isEditingTextField &&
        !key.upArrow &&
        !key.downArrow &&
        !key.return &&
        !key.backspace
      ) {
        return
      }

      // Expanded multi-select accordion
      if (
        expandedAccordion &&
        currentField &&
        isMultiSelectEnumSchema(currentField.schema)
      ) {
        const msSchema = currentField.schema
        const msValues = getMultiSelectValues(msSchema)
        const selected = (formValues[currentField.name] as string[]) ?? []

        if (key.leftArrow || key.escape) {
          setExpandedAccordion(undefined)
          validateMultiSelect(currentField.name, msSchema)
          return
        }
        if (key.upArrow) {
          if (accordionOptionIndex === 0) {
            setExpandedAccordion(undefined)
            validateMultiSelect(currentField.name, msSchema)
          } else {
            setAccordionOptionIndex(accordionOptionIndex - 1)
          }
          return
        }
        if (key.downArrow) {
          if (accordionOptionIndex >= msValues.length - 1) {
            setExpandedAccordion(undefined)
            handleNavigation('down')
          } else {
            setAccordionOptionIndex(accordionOptionIndex + 1)
          }
          return
        }
        if (_input === ' ') {
          const optionValue = msValues[accordionOptionIndex]
          if (optionValue !== undefined) {
            const newSelected = selected.includes(optionValue)
              ? selected.filter(v => v !== optionValue)
              : [...selected, optionValue]
            const newValue = newSelected.length > 0 ? newSelected : undefined
            setField(currentField.name, newValue)
            const min = msSchema.minItems
            const max = msSchema.maxItems
            if (
              min !== undefined &&
              newSelected.length < min &&
              (newSelected.length > 0 || currentField.isRequired)
            ) {
              updateValidationError(
                currentField.name,
                `Select at least ${min} ${plural(min, 'item')}`,
              )
            } else if (max !== undefined && newSelected.length > max) {
              updateValidationError(
                currentField.name,
                `Select at most ${max} ${plural(max, 'item')}`,
              )
            } else {
              updateValidationError(currentField.name)
            }
          }
          return
        }
        if (key.return) {
          // Check (not toggle) the focused item, then collapse and advance
          const optionValue = msValues[accordionOptionIndex]
          if (optionValue !== undefined && !selected.includes(optionValue)) {
            setField(currentField.name, [...selected, optionValue])
          }
          setExpandedAccordion(undefined)
          handleNavigation('down')
          return
        }
        if (_input) {
          const labels = msValues.map(v =>
            getMultiSelectLabel(msSchema, v).toLowerCase(),
          )
          runTypeahead(_input, labels, setAccordionOptionIndex)
          return
        }
        return
      }

      // Expanded single-select enum accordion
      if (
        expandedAccordion &&
        currentField &&
        isEnumSchema(currentField.schema)
      ) {
        const enumSchema = currentField.schema
        const enumValues = getEnumValues(enumSchema)

        if (key.leftArrow || key.escape) {
          setExpandedAccordion(undefined)
          return
        }
        if (key.upArrow) {
          if (accordionOptionIndex === 0) {
            setExpandedAccordion(undefined)
          } else {
            setAccordionOptionIndex(accordionOptionIndex - 1)
          }
          return
        }
        if (key.downArrow) {
          if (accordionOptionIndex >= enumValues.length - 1) {
            setExpandedAccordion(undefined)
            handleNavigation('down')
          } else {
            setAccordionOptionIndex(accordionOptionIndex + 1)
          }
          return
        }
        // Space: select and collapse
        if (_input === ' ') {
          const optionValue = enumValues[accordionOptionIndex]
          if (optionValue !== undefined) {
            setField(currentField.name, optionValue)
          }
          setExpandedAccordion(undefined)
          return
        }
        // Enter: select, collapse, and move to next field
        if (key.return) {
          const optionValue = enumValues[accordionOptionIndex]
          if (optionValue !== undefined) {
            setField(currentField.name, optionValue)
          }
          setExpandedAccordion(undefined)
          handleNavigation('down')
          return
        }
        if (_input) {
          const labels = enumValues.map(v =>
            getEnumLabel(enumSchema, v).toLowerCase(),
          )
          runTypeahead(_input, labels, setAccordionOptionIndex)
          return
        }
        return
      }

      // Accept / Decline buttons
      if (key.return && focusedButton === 'accept') {
        if (validateRequired() && Object.keys(validationErrors).length === 0) {
          onResponse('accept', formValues)
        } else {
          // Show "required" validation errors on missing fields
          const requiredFields = requestedSchema.required || []
          for (const fieldName of requiredFields) {
            if (formValues[fieldName] === undefined) {
              updateValidationError(fieldName, 'This field is required')
            }
          }
          const firstBadIndex = schemaFields.findIndex(
            f =>
              (requiredFields.includes(f.name) &&
                formValues[f.name] === undefined) ||
              validationErrors[f.name] !== undefined,
          )
          if (firstBadIndex !== -1) {
            setCurrentFieldIndex(firstBadIndex)
            setFocusedButton(null)
            syncTextInput(firstBadIndex)
          }
        }
        return
      }

      if (key.return && focusedButton === 'decline') {
        onResponse('decline')
        return
      }

      // Up/Down navigation
      if (key.upArrow || key.downArrow) {
        // Reset enum typeahead when leaving a field
        const ta = enumTypeaheadRef.current
        ta.buffer = ''
        if (ta.timer !== undefined) {
          clearTimeout(ta.timer)
          ta.timer = undefined
        }
        handleNavigation(key.upArrow ? 'up' : 'down')
        return
      }

      // Left/Right to switch between Accept and Decline buttons
      if (focusedButton && (key.leftArrow || key.rightArrow)) {
        setFocusedButton(focusedButton === 'accept' ? 'decline' : 'accept')
        return
      }

      if (!currentField) return
      const { schema, name } = currentField
      const value = formValues[name]

      // Boolean: Space to toggle, Enter to move on
      if (schema.type === 'boolean') {
        if (_input === ' ') {
          setField(name, value === undefined ? true : !value)
          return
        }
        if (key.return) {
          handleNavigation('down')
          return
        }
        if (key.backspace && value !== undefined) {
          unsetField(name)
          return
        }
        // y/n typeahead
        if (_input && !key.return) {
          runTypeahead(_input, ['yes', 'no'], i => setField(name, i === 0))
          return
        }
        return
      }

      // Enum or multi-select (collapsed) — accordion style
      if (isEnumSchema(schema) || isMultiSelectEnumSchema(schema)) {
        if (key.return) {
          handleNavigation('down')
          return
        }
        if (key.backspace && value !== undefined) {
          unsetField(name)
          return
        }
        // Compute option labels + initial focus index for rightArrow expand.
        // Single-select focuses on the current value; multi-select starts at 0.
        let labels: string[]
        let startIdx = 0
        if (isEnumSchema(schema)) {
          const vals = getEnumValues(schema)
          labels = vals.map(v => getEnumLabel(schema, v).toLowerCase())
          if (value !== undefined) {
            startIdx = Math.max(0, vals.indexOf(value as string))
          }
        } else {
          const vals = getMultiSelectValues(schema)
          labels = vals.map(v => getMultiSelectLabel(schema, v).toLowerCase())
        }
        if (key.rightArrow) {
          setExpandedAccordion(name)
          setAccordionOptionIndex(startIdx)
          return
        }
        // Typeahead: expand and jump to matching option
        if (_input && !key.leftArrow) {
          runTypeahead(_input, labels, i => {
            setExpandedAccordion(name)
            setAccordionOptionIndex(i)
          })
          return
        }
        return
      }

      // Backspace: text fields when empty
      if (key.backspace) {
        if (isEditingTextField && textInputValue === '') {
          unsetField(name)
          return
        }
      }

      // Text field Enter is handled by TextInput's onSubmit
    },
    { isActive: true },
  )

  function validateRequired(): boolean {
    const requiredFields = requestedSchema.required || []
    for (const fieldName of requiredFields) {
      const value = formValues[fieldName]
      if (value === undefined || value === null || value === '') {
        return false
      }
      if (Array.isArray(value) && value.length === 0) {
        return false
      }
    }
    return true
  }

  // Scroll windowing: compute visible field range
  // Overhead: ~9 lines (dialog chrome, buttons, footer).
  // Each field: ~3 lines (label + description + validation spacer).
  // NOTE(v2): Multi-select accordion expands to N+3 lines when open.
  // For now we assume 3 lines per field; an expanded accordion may
  // temporarily push content off-screen (terminal scrollback handles it).
  // To generalize: track per-field height (3 for collapsed, N+3 for
  // expanded multi-select) and compute a pixel-budget window instead
  // of a simple item-count window.
  const LINES_PER_FIELD = 3
  const DIALOG_OVERHEAD = 14
  const maxVisibleFields = Math.max(
    2,
    Math.floor((rows - DIALOG_OVERHEAD) / LINES_PER_FIELD),
  )

  const scrollWindow = useMemo(() => {
    const total = schemaFields.length
    if (total <= maxVisibleFields) {
      return { start: 0, end: total }
    }
    // When buttons are focused (currentFieldIndex undefined), pin to end
    const focusIdx = currentFieldIndex ?? total - 1
    let start = Math.max(0, focusIdx - Math.floor(maxVisibleFields / 2))
    const end = Math.min(start + maxVisibleFields, total)
    // Adjust start if we hit the bottom
    start = Math.max(0, end - maxVisibleFields)
    return { start, end }
  }, [schemaFields.length, maxVisibleFields, currentFieldIndex])

  const hasFieldsAbove = scrollWindow.start > 0
  const hasFieldsBelow = scrollWindow.end < schemaFields.length

  function renderFormFields(): React.ReactNode {
    if (!schemaFields.length) return null

    return (
      <Box flexDirection="column">
        {hasFieldsAbove && (
          <Box marginLeft={2}>
            <Text dimColor>
              {figures.arrowUp} {scrollWindow.start} more above
            </Text>
          </Box>
        )}
        {schemaFields
          .slice(scrollWindow.start, scrollWindow.end)
          .map((field, visibleIdx) => {
            const index = scrollWindow.start + visibleIdx
            const { name, schema, isRequired } = field
            const isActive = index === currentFieldIndex && !focusedButton
            const value = formValues[name]
            const hasValue =
              value !== undefined && (!Array.isArray(value) || value.length > 0)
            const error = validationErrors[name]

            // Checkbox: spinner → ⚠ error → ✔ set → * required → space
            const isResolving = resolvingFields.has(name)
            const checkbox = isResolving ? (
              <ResolvingSpinner />
            ) : error ? (
              <Text color="error">{figures.warning}</Text>
            ) : hasValue ? (
              <Text color="success" dimColor={!isActive}>
                {figures.tick}
              </Text>
            ) : isRequired ? (
              <Text color="error">*</Text>
            ) : (
              <Text> </Text>
            )

            // Selection color matches field status
            const selectionColor = error
              ? 'error'
              : hasValue
                ? 'success'
                : isRequired
                  ? 'error'
                  : 'suggestion'

            const activeColor = isActive ? selectionColor : undefined

            const label = (
              <Text color={activeColor} bold={isActive}>
                {schema.title || name}
              </Text>
            )

            // Render the value portion based on field type
            let valueContent: React.ReactNode
            let accordionContent: React.ReactNode = null

            if (isMultiSelectEnumSchema(schema)) {
              const msValues = getMultiSelectValues(schema)
              const selected = (value as string[] | undefined) ?? []
              const isExpanded = expandedAccordion === name && isActive

              if (isExpanded) {
                valueContent = <Text dimColor>{figures.triangleDownSmall}</Text>
                accordionContent = (
                  <Box flexDirection="column" marginLeft={6}>
                    {msValues.map((optVal, optIdx) => {
                      const optLabel = getMultiSelectLabel(schema, optVal)
                      const isChecked = selected.includes(optVal)
                      const isFocused = optIdx === accordionOptionIndex
                      return (
                        <Box key={optVal} gap={1}>
                          <Text color="suggestion">
                            {isFocused ? figures.pointer : ' '}
                          </Text>
                          <Text color={isChecked ? 'success' : undefined}>
                            {isChecked
                              ? figures.checkboxOn
                              : figures.checkboxOff}
                          </Text>
                          <Text
                            color={isFocused ? 'suggestion' : undefined}
                            bold={isFocused}
                          >
                            {optLabel}
                          </Text>
                        </Box>
                      )
                    })}
                  </Box>
                )
              } else {
                // Collapsed: ▸ arrow then comma-joined selected items
                const arrow = isActive ? (
                  <Text dimColor>{figures.triangleRightSmall} </Text>
                ) : null
                if (selected.length > 0) {
                  const displayLabels = selected.map(v =>
                    getMultiSelectLabel(schema, v),
                  )
                  valueContent = (
                    <Text>
                      {arrow}
                      <Text color={activeColor} bold={isActive}>
                        {displayLabels.join(', ')}
                      </Text>
                    </Text>
                  )
                } else {
                  valueContent = (
                    <Text>
                      {arrow}
                      <Text dimColor italic>
                        not set
                      </Text>
                    </Text>
                  )
                }
              }
            } else if (isEnumSchema(schema)) {
              const enumValues = getEnumValues(schema)
              const isExpanded = expandedAccordion === name && isActive

              if (isExpanded) {
                valueContent = <Text dimColor>{figures.triangleDownSmall}</Text>
                accordionContent = (
                  <Box flexDirection="column" marginLeft={6}>
                    {enumValues.map((optVal, optIdx) => {
                      const optLabel = getEnumLabel(schema, optVal)
                      const isSelected = value === optVal
                      const isFocused = optIdx === accordionOptionIndex
                      return (
                        <Box key={optVal} gap={1}>
                          <Text color="suggestion">
                            {isFocused ? figures.pointer : ' '}
                          </Text>
                          <Text color={isSelected ? 'success' : undefined}>
                            {isSelected ? figures.radioOn : figures.radioOff}
                          </Text>
                          <Text
                            color={isFocused ? 'suggestion' : undefined}
                            bold={isFocused}
                          >
                            {optLabel}
                          </Text>
                        </Box>
                      )
                    })}
                  </Box>
                )
              } else {
                // Collapsed: ▸ arrow then current value
                const arrow = isActive ? (
                  <Text dimColor>{figures.triangleRightSmall} </Text>
                ) : null
                if (hasValue) {
                  valueContent = (
                    <Text>
                      {arrow}
                      <Text color={activeColor} bold={isActive}>
                        {getEnumLabel(schema, value as string)}
                      </Text>
                    </Text>
                  )
                } else {
                  valueContent = (
                    <Text>
                      {arrow}
                      <Text dimColor italic>
                        not set
                      </Text>
                    </Text>
                  )
                }
              }
            } else if (schema.type === 'boolean') {
              if (isActive) {
                valueContent = hasValue ? (
                  <Text color={activeColor} bold>
                    {value ? figures.checkboxOn : figures.checkboxOff}
                  </Text>
                ) : (
                  <Text dimColor>{figures.checkboxOff}</Text>
                )
              } else {
                valueContent = hasValue ? (
                  <Text>
                    {value ? figures.checkboxOn : figures.checkboxOff}
                  </Text>
                ) : (
                  <Text dimColor italic>
                    not set
                  </Text>
                )
              }
            } else if (isTextField(schema)) {
              if (isActive) {
                valueContent = (
                  <TextInput
                    value={textInputValue}
                    onChange={handleTextInputChange}
                    onSubmit={handleTextInputSubmit}
                    placeholder={`Type something\u{2026}`}
                    columns={Math.min(columns - 20, 60)}
                    cursorOffset={textInputCursorOffset}
                    onChangeCursorOffset={setTextInputCursorOffset}
                    focus
                    showCursor
                  />
                )
              } else {
                const displayValue =
                  hasValue && isDateTimeSchema(schema)
                    ? formatDateDisplay(String(value), schema)
                    : String(value)
                valueContent = hasValue ? (
                  <Text>{displayValue}</Text>
                ) : (
                  <Text dimColor italic>
                    not set
                  </Text>
                )
              }
            } else {
              valueContent = hasValue ? (
                <Text>{String(value)}</Text>
              ) : (
                <Text dimColor italic>
                  not set
                </Text>
              )
            }

            return (
              <Box key={name} flexDirection="column">
                <Box gap={1}>
                  <Text color={selectionColor}>
                    {isActive ? figures.pointer : ' '}
                  </Text>
                  {checkbox}
                  <Box>
                    {label}
                    <Text color={activeColor}>: </Text>
                    {valueContent}
                  </Box>
                </Box>
                {accordionContent}
                {schema.description && (
                  <Box marginLeft={6}>
                    <Text dimColor>{schema.description}</Text>
                  </Box>
                )}
                <Box marginLeft={6} height={1}>
                  {error ? (
                    <Text color="error" italic>
                      {error}
                    </Text>
                  ) : (
                    <Text> </Text>
                  )}
                </Box>
              </Box>
            )
          })}
        {hasFieldsBelow && (
          <Box marginLeft={2}>
            <Text dimColor>
              {figures.arrowDown} {schemaFields.length - scrollWindow.end} more
              below
            </Text>
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Dialog
      title={`MCP server \u201c${serverName}\u201d requests your input`}
      subtitle={`\n${message}`}
      color="permission"
      onCancel={() => onResponse('cancel')}
      isCancelActive={(!currentField || !!focusedButton) && !expandedAccordion}
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <Byline>
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="cancel"
            />
            <KeyboardShortcutHint shortcut="↑↓" action="navigate" />
            {currentField && (
              <KeyboardShortcutHint shortcut="Backspace" action="unset" />
            )}
            {currentField && currentField.schema.type === 'boolean' && (
              <KeyboardShortcutHint shortcut="Space" action="toggle" />
            )}
            {currentField &&
              isEnumSchema(currentField.schema) &&
              (expandedAccordion ? (
                <KeyboardShortcutHint shortcut="Space" action="select" />
              ) : (
                <KeyboardShortcutHint shortcut="→" action="expand" />
              ))}
            {currentField &&
              isMultiSelectEnumSchema(currentField.schema) &&
              (expandedAccordion ? (
                <KeyboardShortcutHint shortcut="Space" action="toggle" />
              ) : (
                <KeyboardShortcutHint shortcut="→" action="expand" />
              ))}
          </Byline>
        )
      }
    >
      <Box flexDirection="column">
        {renderFormFields()}
        <Box>
          <Text color="success">
            {focusedButton === 'accept' ? figures.pointer : ' '}
          </Text>
          <Text
            bold={focusedButton === 'accept'}
            color={focusedButton === 'accept' ? 'success' : undefined}
            dimColor={focusedButton !== 'accept'}
          >
            {' Accept  '}
          </Text>
          <Text color="error">
            {focusedButton === 'decline' ? figures.pointer : ' '}
          </Text>
          <Text
            bold={focusedButton === 'decline'}
            color={focusedButton === 'decline' ? 'error' : undefined}
            dimColor={focusedButton !== 'decline'}
          >
            {' Decline'}
          </Text>
        </Box>
      </Box>
    </Dialog>
  )
}

function ElicitationURLDialog({
  event,
  onResponse,
  onWaitingDismiss,
}: {
  event: ElicitationRequestEvent
  onResponse: Props['onResponse']
  onWaitingDismiss: Props['onWaitingDismiss']
}): React.ReactNode {
  const { serverName, signal, waitingState } = event
  const urlParams = event.params as ElicitRequestURLParams
  const { message, url } = urlParams
  const [phase, setPhase] = useState<'prompt' | 'waiting'>('prompt')
  const phaseRef = useRef<'prompt' | 'waiting'>('prompt')
  const [focusedButton, setFocusedButton] = useState<
    'accept' | 'decline' | 'open' | 'action' | 'cancel'
  >('accept')
  const showCancel = waitingState?.showCancel ?? false

  useNotifyAfterTimeout(
    'Claude Code needs your input',
    'elicitation_url_dialog',
  )
  useRegisterOverlay('elicitation-url')

  // Keep refs in sync for use in abort handler (avoids re-registering listener)
  phaseRef.current = phase
  const onWaitingDismissRef = useRef(onWaitingDismiss)
  onWaitingDismissRef.current = onWaitingDismiss

  useEffect(() => {
    const handleAbort = () => {
      if (phaseRef.current === 'waiting') {
        onWaitingDismissRef.current?.('cancel')
      } else {
        onResponse('cancel')
      }
    }
    if (signal.aborted) {
      handleAbort()
      return
    }
    signal.addEventListener('abort', handleAbort)
    return () => signal.removeEventListener('abort', handleAbort)
  }, [signal, onResponse])

  // Parse URL to highlight the domain
  let domain = ''
  let urlBeforeDomain = ''
  let urlAfterDomain = ''
  try {
    const parsed = new URL(url)
    domain = parsed.hostname
    const domainStart = url.indexOf(domain)
    urlBeforeDomain = url.slice(0, domainStart)
    urlAfterDomain = url.slice(domainStart + domain.length)
  } catch {
    domain = url
  }

  // Auto-dismiss when the server sends a completion notification (sets completed flag)
  useEffect(() => {
    if (phase === 'waiting' && event.completed) {
      onWaitingDismiss?.(showCancel ? 'retry' : 'dismiss')
    }
  }, [phase, event.completed, onWaitingDismiss, showCancel])

  const handleAccept = useCallback(() => {
    void openBrowser(url)
    onResponse('accept')
    setPhase('waiting')
    phaseRef.current = 'waiting'
    setFocusedButton('open')
  }, [onResponse, url])

  // eslint-disable-next-line custom-rules/prefer-use-keybindings -- raw input for button navigation
  useInput((_input, key) => {
    if (phase === 'prompt') {
      if (key.leftArrow || key.rightArrow) {
        setFocusedButton(prev => (prev === 'accept' ? 'decline' : 'accept'))
        return
      }
      if (key.return) {
        if (focusedButton === 'accept') {
          handleAccept()
        } else {
          onResponse('decline')
        }
      }
    } else {
      // waiting phase — cycle through buttons
      type ButtonName = 'accept' | 'decline' | 'open' | 'action' | 'cancel'
      const waitingButtons: readonly ButtonName[] = showCancel
        ? ['open', 'action', 'cancel']
        : ['open', 'action']
      if (key.leftArrow || key.rightArrow) {
        setFocusedButton(prev => {
          const idx = waitingButtons.indexOf(prev)
          const delta = key.rightArrow ? 1 : -1
          return waitingButtons[
            (idx + delta + waitingButtons.length) % waitingButtons.length
          ]!
        })
        return
      }
      if (key.return) {
        if (focusedButton === 'open') {
          void openBrowser(url)
        } else if (focusedButton === 'cancel') {
          onWaitingDismiss?.('cancel')
        } else {
          onWaitingDismiss?.(showCancel ? 'retry' : 'dismiss')
        }
      }
    }
  })

  if (phase === 'waiting') {
    const actionLabel = waitingState?.actionLabel ?? 'Continue without waiting'
    return (
      <Dialog
        title={`MCP server \u201c${serverName}\u201d \u2014 waiting for completion`}
        subtitle={`\n${message}`}
        color="permission"
        onCancel={() => onWaitingDismiss?.('cancel')}
        isCancelActive
        inputGuide={exitState =>
          exitState.pending ? (
            <Text>Press {exitState.keyName} again to exit</Text>
          ) : (
            <Byline>
              <ConfigurableShortcutHint
                action="confirm:no"
                context="Confirmation"
                fallback="Esc"
                description="cancel"
              />
              <KeyboardShortcutHint shortcut="\u2190\u2192" action="switch" />
            </Byline>
          )
        }
      >
        <Box flexDirection="column">
          <Box marginBottom={1} flexDirection="column">
            <Text>
              {urlBeforeDomain}
              <Text bold>{domain}</Text>
              {urlAfterDomain}
            </Text>
          </Box>
          <Box marginBottom={1}>
            <Text dimColor italic>
              Waiting for the server to confirm completion…
            </Text>
          </Box>
          <Box>
            <Text color="success">
              {focusedButton === 'open' ? figures.pointer : ' '}
            </Text>
            <Text
              bold={focusedButton === 'open'}
              color={focusedButton === 'open' ? 'success' : undefined}
              dimColor={focusedButton !== 'open'}
            >
              {' Reopen URL  '}
            </Text>
            <Text color="success">
              {focusedButton === 'action' ? figures.pointer : ' '}
            </Text>
            <Text
              bold={focusedButton === 'action'}
              color={focusedButton === 'action' ? 'success' : undefined}
              dimColor={focusedButton !== 'action'}
            >
              {` ${actionLabel}`}
            </Text>
            {showCancel && (
              <>
                <Text> </Text>
                <Text color="error">
                  {focusedButton === 'cancel' ? figures.pointer : ' '}
                </Text>
                <Text
                  bold={focusedButton === 'cancel'}
                  color={focusedButton === 'cancel' ? 'error' : undefined}
                  dimColor={focusedButton !== 'cancel'}
                >
                  {' Cancel'}
                </Text>
              </>
            )}
          </Box>
        </Box>
      </Dialog>
    )
  }

  return (
    <Dialog
      title={`MCP server \u201c${serverName}\u201d wants to open a URL`}
      subtitle={`\n${message}`}
      color="permission"
      onCancel={() => onResponse('cancel')}
      isCancelActive
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <Byline>
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="cancel"
            />
            <KeyboardShortcutHint shortcut="\u2190\u2192" action="switch" />
          </Byline>
        )
      }
    >
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <Text>
            {urlBeforeDomain}
            <Text bold>{domain}</Text>
            {urlAfterDomain}
          </Text>
        </Box>
        <Box>
          <Text color="success">
            {focusedButton === 'accept' ? figures.pointer : ' '}
          </Text>
          <Text
            bold={focusedButton === 'accept'}
            color={focusedButton === 'accept' ? 'success' : undefined}
            dimColor={focusedButton !== 'accept'}
          >
            {' Accept  '}
          </Text>
          <Text color="error">
            {focusedButton === 'decline' ? figures.pointer : ' '}
          </Text>
          <Text
            bold={focusedButton === 'decline'}
            color={focusedButton === 'decline' ? 'error' : undefined}
            dimColor={focusedButton !== 'decline'}
          >
            {' Decline'}
          </Text>
        </Box>
      </Box>
    </Dialog>
  )
}
