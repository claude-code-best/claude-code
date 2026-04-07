import figures from 'figures'
import React, { type ReactNode, useEffect, useRef, useState } from 'react'
import { Ansi, Box, Text, stringWidth, useDeclaredCursor } from '@anthropic/ink'
import { count } from '../../utils/array.js'
import type { PastedContent } from '../../utils/config.js'
import type { ImageDimensions } from '../../utils/imageResizer.js'
import { SelectInputOption } from './select-input-option.js'
import { SelectOption } from './select-option.js'
import { useSelectInput } from './use-select-input.js'
import { useSelectState } from './use-select-state.js'

// Extract text content from ReactNode for width calculation
function getTextContent(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(getTextContent).join('')
  if (React.isValidElement<{ children?: ReactNode }>(node)) {
    return getTextContent(node.props.children)
  }
  return ''
}

type BaseOption<T> = {
  description?: string
  dimDescription?: boolean
  label: ReactNode
  value: T
  disabled?: boolean
}

export type OptionWithDescription<T = string> =
  | (BaseOption<T> & {
      type?: 'text'
    })
  | (BaseOption<T> & {
      type: 'input'
      onChange: (value: string) => void
      placeholder?: string
      initialValue?: string
      /**
       * Controls behavior when submitting with empty input:
       * - true: calls onChange (treats empty as valid submission)
       * - false (default): calls onCancel (treats empty as cancellation)
       *
       * Also affects initial Enter press: when true, submits immediately;
       * when false, enters input mode first so user can type.
       */
      allowEmptySubmitToCancel?: boolean
      /**
       * When true, always shows the label alongside the input value, regardless of
       * the global inlineDescriptions/showLabel setting. Use this when the label
       * provides important context that should always be visible (e.g., "Yes, and allow...").
       */
      showLabelWithValue?: boolean
      /**
       * Custom separator between label and value when showLabel is true.
       * Defaults to ", ". Use ": " for labels that read better with a colon.
       */
      labelValueSeparator?: string
      /**
       * When true, automatically reset cursor to end of line when:
       * - Option becomes focused
       * - Input value changes
       * This prevents cursor position bugs when the input value updates asynchronously.
       */
      resetCursorOnUpdate?: boolean
    })

export type SelectProps<T> = {
  /**
   * When disabled, user input is ignored.
   *
   * @default false
   */
  readonly isDisabled?: boolean

  /**
   * When true, prevents selection on Enter but allows scrolling.
   *
   * @default false
   */
  readonly disableSelection?: boolean

  /**
   * When true, hides the numeric indexes next to each option.
   *
   * @default false
   */
  readonly hideIndexes?: boolean

  /**
   * Number of visible options.
   *
   * @default 5
   */
  readonly visibleOptionCount?: number

  /**
   * Highlight text in option labels.
   */
  readonly highlightText?: string

  /**
   * Options.
   */
  readonly options: OptionWithDescription<T>[]

  /**
   * Default value.
   */
  readonly defaultValue?: T

  /**
   * Callback when cancel is pressed.
   */
  readonly onCancel?: () => void

  /**
   * Callback when selected option changes.
   */
  readonly onChange?: (value: T) => void

  /**
   * Callback when focused option changes.
   * Note: This is for one-way notification only. Avoid combining with focusValue
   * for bidirectional sync, as this can cause feedback loops.
   */
  readonly onFocus?: (value: T) => void

  /**
   * Initial value to focus. This is used to set focus when the component mounts.
   */
  readonly defaultFocusValue?: T

  /**
   * Layout of the options.
   * - `compact` (default) tries to use one line per option
   * - `expanded` uses multiple lines and an empty line between options
   * - `compact-vertical` uses compact index formatting with descriptions below labels
   */
  readonly layout?: 'compact' | 'expanded' | 'compact-vertical'

  /**
   * When true, descriptions are rendered inline after the label instead of
   * in a separate column. Use this for short descriptions like hints.
   *
   * @default false
   */
  readonly inlineDescriptions?: boolean

  /**
   * Callback when user presses up from the first item.
   * If provided, navigation will not wrap to the last item.
   */
  readonly onUpFromFirstItem?: () => void

  /**
   * Callback when user presses down from the last item.
   * If provided, navigation will not wrap to the first item.
   */
  readonly onDownFromLastItem?: () => void

  /**
   * Callback when input mode should be toggled for an option.
   * Called when Tab is pressed (to enter or exit input mode).
   */
  readonly onInputModeToggle?: (value: T) => void

  /**
   * Callback to open external editor for editing input option values.
   * When provided, ctrl+g will trigger this callback in input options
   * with the current value and a setter function to update the internal state.
   */
  readonly onOpenEditor?: (
    currentValue: string,
    setValue: (value: string) => void,
  ) => void

  /**
   * Optional callback when an image is pasted into an input option.
   */
  readonly onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void

  /**
   * Pasted content to display inline in input options.
   */
  readonly pastedContents?: Record<number, PastedContent>

  /**
   * Callback to remove a pasted image by its ID.
   */
  readonly onRemoveImage?: (id: number) => void
}

export function Select<T>({
  isDisabled = false,
  hideIndexes = false,
  visibleOptionCount = 5,
  highlightText,
  options,
  defaultValue,
  onCancel,
  onChange,
  onFocus,
  defaultFocusValue,
  layout = 'compact',
  disableSelection = false,
  inlineDescriptions = false,
  onUpFromFirstItem,
  onDownFromLastItem,
  onInputModeToggle,
  onOpenEditor,
  onImagePaste,
  pastedContents,
  onRemoveImage,
}: SelectProps<T>): React.ReactNode {
  // Image selection mode state
  const [imagesSelected, setImagesSelected] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)

  // State for input type options
  const [inputValues, setInputValues] = useState<Map<T, string>>(() => {
    const initialMap = new Map<T, string>()
    options.forEach(option => {
      if (option.type === 'input' && option.initialValue) {
        initialMap.set(option.value, option.initialValue)
      }
    })
    return initialMap
  })

  // Track the last initialValue we synced, so we can detect user edits
  const lastInitialValues = useRef<Map<T, string>>(new Map())

  // Sync initialValue changes to inputValues state, but only if user hasn't edited
  useEffect(() => {
    for (const option of options) {
      if (option.type === 'input' && option.initialValue !== undefined) {
        const lastInitial = lastInitialValues.current.get(option.value) ?? ''
        const currentValue = inputValues.get(option.value) ?? ''
        const newInitial = option.initialValue

        // Only update if:
        // 1. The initialValue has changed
        // 2. The user hasn't edited (current value still matches the last initialValue we set)
        if (newInitial !== lastInitial && currentValue === lastInitial) {
          setInputValues(prev => {
            const next = new Map(prev)
            next.set(option.value, newInitial)
            return next
          })
        }

        // Always track the latest initialValue
        lastInitialValues.current.set(option.value, newInitial)
      }
    }
  }, [options, inputValues])

  const state = useSelectState({
    visibleOptionCount,
    options,
    defaultValue,
    onChange,
    onCancel,
    onFocus,
    focusValue: defaultFocusValue,
  })

  useSelectInput({
    isDisabled,
    disableSelection: disableSelection || (hideIndexes ? 'numeric' : false),
    state,
    options,
    isMultiSelect: false, // Select is always single-choice
    onUpFromFirstItem,
    onDownFromLastItem,
    onInputModeToggle,
    inputValues,
    imagesSelected,
    onEnterImageSelection: () => {
      if (
        pastedContents &&
        Object.values(pastedContents).some(c => c.type === 'image')
      ) {
        const imageCount = count(
          Object.values(pastedContents),
          c => c.type === 'image',
        )
        setImagesSelected(true)
        setSelectedImageIndex(imageCount - 1)
        return true
      }
      return false
    },
  })

  const styles = {
    container: () => ({ flexDirection: 'column' as const }),
    highlightedText: () => ({ bold: true }),
  }

  if (layout === 'expanded') {
    const maxIndexWidth = state.options.length.toString().length

    return (
      <Box {...styles.container()}>
        {state.visibleOptions.map((option, index) => {
          const isFirstVisibleOption = option.index === state.visibleFromIndex
          const isLastVisibleOption = option.index === state.visibleToIndex - 1
          const areMoreOptionsBelow = state.visibleToIndex < options.length
          const areMoreOptionsAbove = state.visibleFromIndex > 0

          const i = state.visibleFromIndex + index + 1

          const isFocused = !isDisabled && state.focusedValue === option.value
          const isSelected = state.value === option.value

          // Handle input type options
          if (option.type === 'input') {
            const inputValue = inputValues.has(option.value)
              ? inputValues.get(option.value)!
              : option.initialValue || ''

            return (
              <SelectInputOption
                key={String(option.value)}
                option={option}
                isFocused={isFocused}
                isSelected={isSelected}
                shouldShowDownArrow={areMoreOptionsBelow && isLastVisibleOption}
                shouldShowUpArrow={areMoreOptionsAbove && isFirstVisibleOption}
                maxIndexWidth={maxIndexWidth}
                index={i}
                inputValue={inputValue}
                onInputChange={value => {
                  setInputValues(prev => {
                    const next = new Map(prev)
                    next.set(option.value, value)
                    return next
                  })
                }}
                onSubmit={(value: string) => {
                  const hasImageAttachments =
                    pastedContents &&
                    Object.values(pastedContents).some(c => c.type === 'image')
                  if (
                    value.trim() ||
                    hasImageAttachments ||
                    option.allowEmptySubmitToCancel
                  ) {
                    onChange?.(option.value)
                  } else {
                    onCancel?.()
                  }
                }}
                onExit={onCancel}
                layout="expanded"
                showLabel={inlineDescriptions}
                onOpenEditor={onOpenEditor}
                resetCursorOnUpdate={option.resetCursorOnUpdate}
                onImagePaste={onImagePaste}
                pastedContents={pastedContents}
                onRemoveImage={onRemoveImage}
                imagesSelected={imagesSelected}
                selectedImageIndex={selectedImageIndex}
                onImagesSelectedChange={setImagesSelected}
                onSelectedImageIndexChange={setSelectedImageIndex}
              />
            )
          }

          // Handle text type options
          let label: ReactNode = option.label

          // Only apply highlight when label is a string
          if (
            typeof option.label === 'string' &&
            highlightText &&
            option.label.includes(highlightText)
          ) {
            const labelText = option.label
            const index = labelText.indexOf(highlightText)

            label = (
              <>
                {labelText.slice(0, index)}
                <Text {...styles.highlightedText()}>{highlightText}</Text>
                {labelText.slice(index + highlightText.length)}
              </>
            )
          }

          const isOptionDisabled = option.disabled === true
          const optionColor = isOptionDisabled
            ? undefined
            : isSelected
              ? 'success'
              : isFocused
                ? 'suggestion'
                : undefined

          return (
            <Box
              key={String(option.value)}
              flexDirection="column"
              flexShrink={0}
            >
              <SelectOption
                isFocused={isFocused}
                isSelected={isSelected}
                shouldShowDownArrow={areMoreOptionsBelow && isLastVisibleOption}
                shouldShowUpArrow={areMoreOptionsAbove && isFirstVisibleOption}
              >
                <Text dimColor={isOptionDisabled} color={optionColor}>
                  {label}
                </Text>
              </SelectOption>
              {option.description && (
                <Box paddingLeft={2}>
                  <Text
                    dimColor={
                      isOptionDisabled || option.dimDescription !== false
                    }
                    color={optionColor}
                  >
                    <Ansi>{option.description}</Ansi>
                  </Text>
                </Box>
              )}
              <Text> </Text>
            </Box>
          )
        })}
      </Box>
    )
  }

  if (layout === 'compact-vertical') {
    const maxIndexWidth = hideIndexes
      ? 0
      : state.options.length.toString().length

    return (
      <Box {...styles.container()}>
        {state.visibleOptions.map((option, index) => {
          const isFirstVisibleOption = option.index === state.visibleFromIndex
          const isLastVisibleOption = option.index === state.visibleToIndex - 1
          const areMoreOptionsBelow = state.visibleToIndex < options.length
          const areMoreOptionsAbove = state.visibleFromIndex > 0

          const i = state.visibleFromIndex + index + 1

          const isFocused = !isDisabled && state.focusedValue === option.value
          const isSelected = state.value === option.value

          // Handle input type options
          if (option.type === 'input') {
            const inputValue = inputValues.has(option.value)
              ? inputValues.get(option.value)!
              : option.initialValue || ''

            return (
              <SelectInputOption
                key={String(option.value)}
                option={option}
                isFocused={isFocused}
                isSelected={isSelected}
                shouldShowDownArrow={areMoreOptionsBelow && isLastVisibleOption}
                shouldShowUpArrow={areMoreOptionsAbove && isFirstVisibleOption}
                maxIndexWidth={maxIndexWidth}
                index={i}
                inputValue={inputValue}
                onInputChange={value => {
                  setInputValues(prev => {
                    const next = new Map(prev)
                    next.set(option.value, value)
                    return next
                  })
                }}
                onSubmit={(value: string) => {
                  const hasImageAttachments =
                    pastedContents &&
                    Object.values(pastedContents).some(c => c.type === 'image')
                  if (
                    value.trim() ||
                    hasImageAttachments ||
                    option.allowEmptySubmitToCancel
                  ) {
                    onChange?.(option.value)
                  } else {
                    onCancel?.()
                  }
                }}
                onExit={onCancel}
                layout="compact"
                showLabel={inlineDescriptions}
                onOpenEditor={onOpenEditor}
                resetCursorOnUpdate={option.resetCursorOnUpdate}
                onImagePaste={onImagePaste}
                pastedContents={pastedContents}
                onRemoveImage={onRemoveImage}
                imagesSelected={imagesSelected}
                selectedImageIndex={selectedImageIndex}
                onImagesSelectedChange={setImagesSelected}
                onSelectedImageIndexChange={setSelectedImageIndex}
              />
            )
          }

          // Handle text type options
          let label: ReactNode = option.label

          // Only apply highlight when label is a string
          if (
            typeof option.label === 'string' &&
            highlightText &&
            option.label.includes(highlightText)
          ) {
            const labelText = option.label
            const index = labelText.indexOf(highlightText)

            label = (
              <>
                {labelText.slice(0, index)}
                <Text {...styles.highlightedText()}>{highlightText}</Text>
                {labelText.slice(index + highlightText.length)}
              </>
            )
          }

          const isOptionDisabled = option.disabled === true

          return (
            <Box
              key={String(option.value)}
              flexDirection="column"
              flexShrink={0}
            >
              <SelectOption
                isFocused={isFocused}
                isSelected={isSelected}
                shouldShowDownArrow={areMoreOptionsBelow && isLastVisibleOption}
                shouldShowUpArrow={areMoreOptionsAbove && isFirstVisibleOption}
              >
                <>
                  {!hideIndexes && (
                    <Text dimColor>{`${i}.`.padEnd(maxIndexWidth + 1)}</Text>
                  )}
                  <Text
                    dimColor={isOptionDisabled}
                    color={
                      isOptionDisabled
                        ? undefined
                        : isSelected
                          ? 'success'
                          : isFocused
                            ? 'suggestion'
                            : undefined
                    }
                  >
                    {label}
                  </Text>
                </>
              </SelectOption>
              {option.description && (
                <Box paddingLeft={hideIndexes ? 4 : maxIndexWidth + 4}>
                  <Text
                    dimColor={
                      isOptionDisabled || option.dimDescription !== false
                    }
                    color={
                      isOptionDisabled
                        ? undefined
                        : isSelected
                          ? 'success'
                          : isFocused
                            ? 'suggestion'
                            : undefined
                    }
                  >
                    <Ansi>{option.description}</Ansi>
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )
  }

  const maxIndexWidth = hideIndexes ? 0 : state.options.length.toString().length

  // Check if any visible options have descriptions (for two-column layout)
  // Also check that there are NO input options, since they're not supported in two-column layout
  // Skip two-column layout when inlineDescriptions is enabled
  const hasInputOptions = state.visibleOptions.some(opt => opt.type === 'input')
  const hasDescriptions =
    !inlineDescriptions &&
    !hasInputOptions &&
    state.visibleOptions.some(opt => opt.description)

  // Pre-compute option data for two-column layout
  const optionData = state.visibleOptions.map((option, index) => {
    const isFirstVisibleOption = option.index === state.visibleFromIndex
    const isLastVisibleOption = option.index === state.visibleToIndex - 1
    const areMoreOptionsBelow = state.visibleToIndex < options.length
    const areMoreOptionsAbove = state.visibleFromIndex > 0
    const i = state.visibleFromIndex + index + 1
    const isFocused = !isDisabled && state.focusedValue === option.value
    const isSelected = state.value === option.value
    const isOptionDisabled = option.disabled === true

    let label: ReactNode = option.label
    if (
      typeof option.label === 'string' &&
      highlightText &&
      option.label.includes(highlightText)
    ) {
      const labelText = option.label
      const idx = labelText.indexOf(highlightText)
      label = (
        <>
          {labelText.slice(0, idx)}
          <Text {...styles.highlightedText()}>{highlightText}</Text>
          {labelText.slice(idx + highlightText.length)}
        </>
      )
    }

    return {
      option,
      index: i,
      label,
      isFocused,
      isSelected,
      isOptionDisabled,
      shouldShowDownArrow: areMoreOptionsBelow && isLastVisibleOption,
      shouldShowUpArrow: areMoreOptionsAbove && isFirstVisibleOption,
    }
  })

  // Calculate max label width for alignment when descriptions exist
  if (hasDescriptions) {
    const maxLabelWidth = Math.max(
      ...optionData.map(data => {
        if (data.option.type === 'input') return 0
        const labelText = getTextContent(data.option.label)
        // Width: indicator (1) + space (1) + index + label + space + checkmark (1)
        const indexWidth = hideIndexes ? 0 : maxIndexWidth + 2
        const checkmarkWidth = data.isSelected ? 2 : 0
        return 2 + indexWidth + stringWidth(labelText) + checkmarkWidth
      }),
    )

    return (
      <Box {...styles.container()}>
        {optionData.map(data => {
          if (data.option.type === 'input') {
            // Input options not supported in two-column layout
            return null
          }
          const labelText = getTextContent(data.option.label)
          const indexWidth = hideIndexes ? 0 : maxIndexWidth + 2
          const checkmarkWidth = data.isSelected ? 2 : 0
          const currentLabelWidth =
            2 + indexWidth + stringWidth(labelText) + checkmarkWidth
          const padding = maxLabelWidth - currentLabelWidth

          return (
            <TwoColumnRow
              key={String(data.option.value)}
              isFocused={data.isFocused}
            >
              {/* Label part - no gap, handle spacing explicitly */}
              <Box flexDirection="row" flexShrink={0}>
                {data.isFocused ? (
                  <Text color="suggestion">{figures.pointer}</Text>
                ) : data.shouldShowDownArrow ? (
                  <Text dimColor>{figures.arrowDown}</Text>
                ) : data.shouldShowUpArrow ? (
                  <Text dimColor>{figures.arrowUp}</Text>
                ) : (
                  <Text> </Text>
                )}
                <Text> </Text>
                <Text
                  dimColor={data.isOptionDisabled}
                  color={
                    data.isOptionDisabled
                      ? undefined
                      : data.isSelected
                        ? 'success'
                        : data.isFocused
                          ? 'suggestion'
                          : undefined
                  }
                >
                  {!hideIndexes && (
                    <Text dimColor>
                      {`${data.index}.`.padEnd(maxIndexWidth + 2)}
                    </Text>
                  )}
                  {data.label}
                </Text>
                {data.isSelected && (
                  <Text color="success"> {figures.tick}</Text>
                )}
                {/* Padding to align descriptions */}
                {padding > 0 && <Text>{' '.repeat(padding)}</Text>}
              </Box>
              {/* Description part */}
              <Box flexGrow={1} marginLeft={2}>
                <Text
                  wrap="wrap"
                  dimColor={
                    data.isOptionDisabled ||
                    data.option.dimDescription !== false
                  }
                  color={
                    data.isOptionDisabled
                      ? undefined
                      : data.isSelected
                        ? 'success'
                        : data.isFocused
                          ? 'suggestion'
                          : undefined
                  }
                >
                  <Ansi>{data.option.description || ' '}</Ansi>
                </Text>
              </Box>
            </TwoColumnRow>
          )
        })}
      </Box>
    )
  }

  return (
    <Box {...styles.container()}>
      {state.visibleOptions.map((option, index) => {
        // Handle input type options
        if (option.type === 'input') {
          const inputValue = inputValues.has(option.value)
            ? inputValues.get(option.value)!
            : option.initialValue || ''

          const isFirstVisibleOption = option.index === state.visibleFromIndex
          const isLastVisibleOption = option.index === state.visibleToIndex - 1
          const areMoreOptionsBelow = state.visibleToIndex < options.length
          const areMoreOptionsAbove = state.visibleFromIndex > 0

          const i = state.visibleFromIndex + index + 1

          const isFocused = !isDisabled && state.focusedValue === option.value
          const isSelected = state.value === option.value

          return (
            <SelectInputOption
              key={String(option.value)}
              option={option}
              isFocused={isFocused}
              isSelected={isSelected}
              shouldShowDownArrow={areMoreOptionsBelow && isLastVisibleOption}
              shouldShowUpArrow={areMoreOptionsAbove && isFirstVisibleOption}
              maxIndexWidth={maxIndexWidth}
              index={i}
              inputValue={inputValue}
              onInputChange={value => {
                setInputValues(prev => {
                  const next = new Map(prev)
                  next.set(option.value, value)
                  return next
                })
              }}
              onSubmit={(value: string) => {
                const hasImageAttachments =
                  pastedContents &&
                  Object.values(pastedContents).some(c => c.type === 'image')
                if (
                  value.trim() ||
                  hasImageAttachments ||
                  option.allowEmptySubmitToCancel
                ) {
                  onChange?.(option.value)
                } else {
                  onCancel?.()
                }
              }}
              onExit={onCancel}
              layout="compact"
              showLabel={inlineDescriptions}
              onOpenEditor={onOpenEditor}
              resetCursorOnUpdate={option.resetCursorOnUpdate}
              onImagePaste={onImagePaste}
              pastedContents={pastedContents}
              onRemoveImage={onRemoveImage}
              imagesSelected={imagesSelected}
              selectedImageIndex={selectedImageIndex}
              onImagesSelectedChange={setImagesSelected}
              onSelectedImageIndexChange={setSelectedImageIndex}
            />
          )
        }

        // Handle text type options
        let label: ReactNode = option.label

        // Only apply highlight when label is a string
        if (
          typeof option.label === 'string' &&
          highlightText &&
          option.label.includes(highlightText)
        ) {
          const labelText = option.label
          const index = labelText.indexOf(highlightText)

          label = (
            <>
              {labelText.slice(0, index)}
              <Text {...styles.highlightedText()}>{highlightText}</Text>
              {labelText.slice(index + highlightText.length)}
            </>
          )
        }

        const isFirstVisibleOption = option.index === state.visibleFromIndex
        const isLastVisibleOption = option.index === state.visibleToIndex - 1
        const areMoreOptionsBelow = state.visibleToIndex < options.length
        const areMoreOptionsAbove = state.visibleFromIndex > 0

        const i = state.visibleFromIndex + index + 1

        const isFocused = !isDisabled && state.focusedValue === option.value
        const isSelected = state.value === option.value
        const isOptionDisabled = option.disabled === true

        return (
          <SelectOption
            key={String(option.value)}
            isFocused={isFocused}
            isSelected={isSelected}
            shouldShowDownArrow={areMoreOptionsBelow && isLastVisibleOption}
            shouldShowUpArrow={areMoreOptionsAbove && isFirstVisibleOption}
          >
            <Box flexDirection="row" flexShrink={0}>
              {!hideIndexes && (
                <Text dimColor>{`${i}.`.padEnd(maxIndexWidth + 2)}</Text>
              )}
              <Text
                dimColor={isOptionDisabled}
                color={
                  isOptionDisabled
                    ? undefined
                    : isSelected
                      ? 'success'
                      : isFocused
                        ? 'suggestion'
                        : undefined
                }
              >
                {label}
                {inlineDescriptions && option.description && (
                  <Text
                    dimColor={
                      isOptionDisabled || option.dimDescription !== false
                    }
                  >
                    {' '}
                    {option.description}
                  </Text>
                )}
              </Text>
            </Box>
            {!inlineDescriptions && option.description && (
              <Box flexShrink={99} marginLeft={2}>
                <Text
                  wrap="wrap-trim"
                  dimColor={isOptionDisabled || option.dimDescription !== false}
                  color={
                    isOptionDisabled
                      ? undefined
                      : isSelected
                        ? 'success'
                        : isFocused
                          ? 'suggestion'
                          : undefined
                  }
                >
                  <Ansi>{option.description}</Ansi>
                </Text>
              </Box>
            )}
          </SelectOption>
        )
      })}
    </Box>
  )
}

// Row container for the two-column (label + description) layout. Unlike
// the other Select layouts, this one doesn't render through SelectOption →
// ListItem, so it declares the native cursor directly. Parks the cursor
// on the pointer indicator so screen readers / magnifiers track focus.
function TwoColumnRow({
  isFocused,
  children,
}: {
  isFocused: boolean
  children: ReactNode
}): React.ReactNode {
  const cursorRef = useDeclaredCursor({
    line: 0,
    column: 0,
    active: isFocused,
  })
  return (
    <Box ref={cursorRef} flexDirection="row">
      {children}
    </Box>
  )
}
