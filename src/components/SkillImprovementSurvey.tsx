import React, { useEffect, useRef } from 'react'
import { BLACK_CIRCLE, BULLET_OPERATOR } from '../constants/figures.js'
import { Box, Text } from '../ink.js'
import type { SkillUpdate } from '../utils/hooks/skillImprovement.js'
import { normalizeFullWidthDigits } from '../utils/stringUtils.js'
import { isValidResponseInput } from './FeedbackSurvey/FeedbackSurveyView.js'
import type { FeedbackSurveyResponse } from './FeedbackSurvey/utils.js'

type Props = {
  isOpen: boolean
  skillName: string
  updates: SkillUpdate[]
  handleSelect: (selected: FeedbackSurveyResponse) => void
  inputValue: string
  setInputValue: (value: string) => void
}

export function SkillImprovementSurvey({
  isOpen,
  skillName,
  updates,
  handleSelect,
  inputValue,
  setInputValue,
}: Props): React.ReactNode {
  if (!isOpen) {
    return null
  }

  // Hide the survey if the user is typing anything other than a survey response
  if (inputValue && !isValidResponseInput(inputValue)) {
    return null
  }

  return (
    <SkillImprovementSurveyView
      skillName={skillName}
      updates={updates}
      onSelect={handleSelect}
      inputValue={inputValue}
      setInputValue={setInputValue}
    />
  )
}

type ViewProps = {
  skillName: string
  updates: SkillUpdate[]
  onSelect: (option: FeedbackSurveyResponse) => void
  inputValue: string
  setInputValue: (value: string) => void
}

// Only 1 (apply) and 0 (dismiss) are valid for this survey
const VALID_INPUTS = ['0', '1'] as const

function isValidInput(input: string): boolean {
  return (VALID_INPUTS as readonly string[]).includes(input)
}

function SkillImprovementSurveyView({
  skillName,
  updates,
  onSelect,
  inputValue,
  setInputValue,
}: ViewProps): React.ReactNode {
  const initialInputValue = useRef(inputValue)

  useEffect(() => {
    if (inputValue !== initialInputValue.current) {
      const lastChar = normalizeFullWidthDigits(inputValue.slice(-1))
      if (isValidInput(lastChar)) {
        setInputValue(inputValue.slice(0, -1))
        // Map: 1 = "good" (apply), 0 = "dismissed"
        onSelect(lastChar === '1' ? 'good' : 'dismissed')
      }
    }
  }, [inputValue, onSelect, setInputValue])

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="ansi:cyan">{BLACK_CIRCLE} </Text>
        <Text bold>
          Skill improvement suggested for &quot;{skillName}&quot;
        </Text>
      </Box>

      <Box flexDirection="column" marginLeft={2}>
        {updates.map((u, i) => (
          <Text key={i} dimColor>
            {BULLET_OPERATOR} {u.change}
          </Text>
        ))}
      </Box>

      <Box marginLeft={2} marginTop={1}>
        <Box width={12}>
          <Text>
            <Text color="ansi:cyan">1</Text>: Apply
          </Text>
        </Box>
        <Box width={14}>
          <Text>
            <Text color="ansi:cyan">0</Text>: Dismiss
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
