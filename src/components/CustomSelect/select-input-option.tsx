import React, { type ReactNode, useEffect, useRef, useState } from 'react'
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- UP arrow exit not in Attachments bindings
import { Box, Text, useInput } from '@anthropic/ink'
import {
  useKeybinding,
  useKeybindings,
} from '../../keybindings/useKeybinding.js'
import type { PastedContent } from '../../utils/config.js'
import { getImageFromClipboard } from '../../utils/imagePaste.js'
import type { ImageDimensions } from '../../utils/imageResizer.js'
import { ClickableImageRef } from '../ClickableImageRef.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { Byline } from '@anthropic/ink'
import TextInput from '../TextInput.js'
import type { OptionWithDescription } from './select.js'
import { SelectOption } from './select-option.js'

type Props<T> = {
  option: Extract<OptionWithDescription<T>, { type: 'input' }>
  isFocused: boolean
  isSelected: boolean
  shouldShowDownArrow: boolean
  shouldShowUpArrow: boolean
  maxIndexWidth: number
  index: number
  inputValue: string
  onInputChange: (value: string) => void
  onSubmit: (value: string) => void
  onExit?: () => void
  layout: 'compact' | 'expanded'
  children?: ReactNode
  /**
   * When true, shows the label before the input field.
   * When false (default), uses the label as the placeholder.
   */
  showLabel?: boolean
  /**
   * Callback to open external editor for editing the input value.
   * When provided, ctrl+g will trigger this callback with the current value
   * and a setter function to update the internal state.
   */
  onOpenEditor?: (
    currentValue: string,
    setValue: (value: string) => void,
  ) => void
  /**
   * When true, automatically reset cursor to end of line when:
   * - Option becomes focused
   * - Input value changes
   * This prevents cursor position bugs when the input value updates asynchronously.
   */
  resetCursorOnUpdate?: boolean
  /**
   * Optional callback when an image is pasted into the input.
   */
  onImagePaste?: (
    base64Image: string,
    mediaType?: string,
    filename?: string,
    dimensions?: ImageDimensions,
    sourcePath?: string,
  ) => void
  /**
   * Pasted content to display inline above the input when focused.
   */
  pastedContents?: Record<number, PastedContent>
  /**
   * Callback to remove a pasted image by its ID.
   */
  onRemoveImage?: (id: number) => void
  /**
   * Whether image selection mode is active.
   */
  imagesSelected?: boolean
  /**
   * Currently selected image index within the image attachments array.
   */
  selectedImageIndex?: number
  /**
   * Callback to set image selection mode on/off.
   */
  onImagesSelectedChange?: (selected: boolean) => void
  /**
   * Callback to change the selected image index.
   */
  onSelectedImageIndexChange?: (index: number) => void
}

export function SelectInputOption<T>({
  option,
  isFocused,
  isSelected,
  shouldShowDownArrow,
  shouldShowUpArrow,
  maxIndexWidth,
  index,
  inputValue,
  onInputChange,
  onSubmit,
  onExit,
  layout,
  children,
  showLabel: showLabelProp = false,
  onOpenEditor,
  resetCursorOnUpdate = false,
  onImagePaste,
  pastedContents,
  onRemoveImage,
  imagesSelected,
  selectedImageIndex = 0,
  onImagesSelectedChange,
  onSelectedImageIndexChange,
}: Props<T>): React.ReactNode {
  const imageAttachments = pastedContents
    ? Object.values(pastedContents).filter(c => c.type === 'image')
    : []

  // Allow individual options to force showing the label via showLabelWithValue
  const showLabel = showLabelProp || option.showLabelWithValue === true
  const [cursorOffset, setCursorOffset] = useState(inputValue.length)

  // Track whether the latest inputValue change was from user typing/pasting,
  // so we can skip resetting cursor to end on user-initiated changes.
  const isUserEditing = useRef(false)

  // Reset cursor to end of line when:
  // 1. Option becomes focused (user navigates to it)
  // 2. Input value changes externally (e.g., async classifier description updates)
  // Skip reset when the change was from user typing (which sets isUserEditing ref)
  // Only enabled when resetCursorOnUpdate prop is true
  useEffect(() => {
    if (resetCursorOnUpdate && isFocused) {
      if (isUserEditing.current) {
        isUserEditing.current = false
      } else {
        setCursorOffset(inputValue.length)
      }
    }
  }, [resetCursorOnUpdate, isFocused, inputValue])

  // ctrl+g to open external editor (reuses chat:externalEditor keybinding)
  useKeybinding(
    'chat:externalEditor',
    () => {
      onOpenEditor?.(inputValue, onInputChange)
    },
    { context: 'Chat', isActive: isFocused && !!onOpenEditor },
  )

  // ctrl+v to paste image from clipboard (same as PromptInput)
  useKeybinding(
    'chat:imagePaste',
    () => {
      if (!onImagePaste) return
      void getImageFromClipboard().then(imageData => {
        if (imageData) {
          onImagePaste(
            imageData.base64,
            imageData.mediaType,
            undefined,
            imageData.dimensions,
          )
        }
      })
    },
    { context: 'Chat', isActive: isFocused && !!onImagePaste },
  )

  // Backspace with empty input removes the last pasted image (non-image-selection mode)
  useKeybinding(
    'attachments:remove',
    () => {
      if (imageAttachments.length > 0 && onRemoveImage) {
        onRemoveImage(imageAttachments.at(-1)!.id)
      }
    },
    {
      context: 'Attachments',
      isActive:
        isFocused &&
        !imagesSelected &&
        inputValue === '' &&
        imageAttachments.length > 0 &&
        !!onRemoveImage,
    },
  )

  // Image selection mode keybindings — reuses existing Attachments actions
  useKeybindings(
    {
      'attachments:next': () => {
        if (imageAttachments.length > 1) {
          onSelectedImageIndexChange?.(
            (selectedImageIndex + 1) % imageAttachments.length,
          )
        }
      },
      'attachments:previous': () => {
        if (imageAttachments.length > 1) {
          onSelectedImageIndexChange?.(
            (selectedImageIndex - 1 + imageAttachments.length) %
              imageAttachments.length,
          )
        }
      },
      'attachments:remove': () => {
        const img = imageAttachments[selectedImageIndex]
        if (img && onRemoveImage) {
          onRemoveImage(img.id)
          // If no images left after removal, exit image selection
          if (imageAttachments.length <= 1) {
            onImagesSelectedChange?.(false)
          } else {
            // Adjust index if we deleted the last image
            onSelectedImageIndexChange?.(
              Math.min(selectedImageIndex, imageAttachments.length - 2),
            )
          }
        }
      },
      'attachments:exit': () => {
        onImagesSelectedChange?.(false)
      },
    },
    { context: 'Attachments', isActive: isFocused && !!imagesSelected },
  )

  // UP arrow exits image selection mode (UP isn't bound to attachments:exit)
  useInput(
    (_input, key) => {
      if (key.upArrow) {
        onImagesSelectedChange?.(false)
      }
    },
    { isActive: isFocused && !!imagesSelected },
  )

  // Exit image mode when option loses focus
  useEffect(() => {
    if (!isFocused && imagesSelected) {
      onImagesSelectedChange?.(false)
    }
  }, [isFocused, imagesSelected, onImagesSelectedChange])

  const descriptionPaddingLeft =
    layout === 'expanded' ? maxIndexWidth + 3 : maxIndexWidth + 4

  return (
    <Box flexDirection="column" flexShrink={0}>
      <SelectOption
        isFocused={isFocused}
        isSelected={isSelected}
        shouldShowDownArrow={shouldShowDownArrow}
        shouldShowUpArrow={shouldShowUpArrow}
        declareCursor={false}
      >
        <Box
          flexDirection="row"
          flexShrink={layout === 'compact' ? 0 : undefined}
        >
          <Text dimColor>{`${index}.`.padEnd(maxIndexWidth + 2)}</Text>
          {children}
          {showLabel ? (
            <>
              <Text color={isFocused ? 'suggestion' : undefined}>
                {option.label}
              </Text>
              {isFocused ? (
                <>
                  <Text color="suggestion">
                    {option.labelValueSeparator ?? ', '}
                  </Text>
                  <TextInput
                    value={inputValue}
                    onChange={value => {
                      isUserEditing.current = true
                      onInputChange(value)
                      option.onChange(value)
                    }}
                    onSubmit={onSubmit}
                    onExit={onExit}
                    placeholder={option.placeholder}
                    focus={!imagesSelected}
                    showCursor={true}
                    multiline={true}
                    cursorOffset={cursorOffset}
                    onChangeCursorOffset={setCursorOffset}
                    columns={80}
                    onImagePaste={onImagePaste}
                    onPaste={(pastedText: string) => {
                      isUserEditing.current = true
                      const before = inputValue.slice(0, cursorOffset)
                      const after = inputValue.slice(cursorOffset)
                      const newValue = before + pastedText + after
                      onInputChange(newValue)
                      option.onChange(newValue)
                      setCursorOffset(before.length + pastedText.length)
                    }}
                  />
                </>
              ) : (
                inputValue && (
                  <Text>
                    {option.labelValueSeparator ?? ', '}
                    {inputValue}
                  </Text>
                )
              )}
            </>
          ) : isFocused ? (
            <TextInput
              value={inputValue}
              onChange={value => {
                isUserEditing.current = true
                onInputChange(value)
                option.onChange(value)
              }}
              onSubmit={onSubmit}
              onExit={onExit}
              placeholder={
                option.placeholder ||
                (typeof option.label === 'string' ? option.label : undefined)
              }
              focus={!imagesSelected}
              showCursor={true}
              multiline={true}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              columns={80}
              onImagePaste={onImagePaste}
              onPaste={(pastedText: string) => {
                isUserEditing.current = true
                const before = inputValue.slice(0, cursorOffset)
                const after = inputValue.slice(cursorOffset)
                const newValue = before + pastedText + after
                onInputChange(newValue)
                option.onChange(newValue)
                setCursorOffset(before.length + pastedText.length)
              }}
            />
          ) : (
            <Text color={inputValue ? undefined : 'inactive'}>
              {inputValue || option.placeholder || option.label}
            </Text>
          )}
        </Box>
      </SelectOption>
      {option.description && (
        <Box paddingLeft={descriptionPaddingLeft}>
          <Text
            dimColor={option.dimDescription !== false}
            color={
              isSelected ? 'success' : isFocused ? 'suggestion' : undefined
            }
          >
            {option.description}
          </Text>
        </Box>
      )}
      {imageAttachments.length > 0 && (
        <Box flexDirection="row" gap={1} paddingLeft={descriptionPaddingLeft}>
          {imageAttachments.map((img, idx) => (
            <ClickableImageRef
              key={img.id}
              imageId={img.id}
              isSelected={!!imagesSelected && idx === selectedImageIndex}
            />
          ))}
          <Box flexGrow={1} justifyContent="flex-start" flexDirection="row">
            <Text dimColor>
              {imagesSelected ? (
                <Byline>
                  {imageAttachments.length > 1 && (
                    <>
                      <ConfigurableShortcutHint
                        action="attachments:next"
                        context="Attachments"
                        fallback="→"
                        description="next"
                      />
                      <ConfigurableShortcutHint
                        action="attachments:previous"
                        context="Attachments"
                        fallback="←"
                        description="prev"
                      />
                    </>
                  )}
                  <ConfigurableShortcutHint
                    action="attachments:remove"
                    context="Attachments"
                    fallback="backspace"
                    description="remove"
                  />
                  <ConfigurableShortcutHint
                    action="attachments:exit"
                    context="Attachments"
                    fallback="esc"
                    description="cancel"
                  />
                </Byline>
              ) : isFocused ? (
                '(↓ to select)'
              ) : null}
            </Text>
          </Box>
        </Box>
      )}
      {layout === 'expanded' && <Text> </Text>}
    </Box>
  )
}
