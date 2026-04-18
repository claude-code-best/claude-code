import figures from 'figures';
import React, { useState } from 'react';
import type { KeyboardEvent } from '@anthropic/ink';
import { Box, Text } from '@anthropic/ink';
import {
  AGENT_COLOR_TO_THEME_COLOR,
  AGENT_COLORS,
  type AgentColorName,
} from '@claude-code-best/builtin-tools/tools/AgentTool/agentColorManager.js';
import { capitalize } from '../../utils/stringUtils.js';

type ColorOption = AgentColorName | 'automatic';

const COLOR_OPTIONS: ColorOption[] = ['automatic', ...AGENT_COLORS];

type Props = {
  agentName: string;
  currentColor?: AgentColorName | 'automatic';
  onConfirm: (color: AgentColorName | undefined) => void;
};

export function ColorPicker({ agentName, currentColor = 'automatic', onConfirm }: Props): React.ReactNode {
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, COLOR_OPTIONS.indexOf(currentColor)));

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'up') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : COLOR_OPTIONS.length - 1));
    } else if (e.key === 'down') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < COLOR_OPTIONS.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'return') {
      e.preventDefault();
      const selected = COLOR_OPTIONS[selectedIndex];
      onConfirm(selected === 'automatic' ? undefined : selected);
    }
  };

  const selectedValue = COLOR_OPTIONS[selectedIndex];

  return (
    <Box flexDirection="column" gap={1} tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Box flexDirection="column">
        {COLOR_OPTIONS.map((option, index) => {
          const isSelected = index === selectedIndex;

          return (
            <Box key={option} flexDirection="row" gap={1}>
              <Text color={isSelected ? 'suggestion' : undefined}>{isSelected ? figures.pointer : ' '}</Text>

              {option === 'automatic' ? (
                <Text bold={isSelected}>Automatic color</Text>
              ) : (
                <Box gap={1}>
                  <Text backgroundColor={AGENT_COLOR_TO_THEME_COLOR[option]} color="inverseText">
                    {' '}
                  </Text>
                  <Text bold={isSelected}>{capitalize(option)}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text>Preview: </Text>
        {selectedValue === undefined || selectedValue === 'automatic' ? (
          <Text inverse bold>
            {' '}
            @{agentName}{' '}
          </Text>
        ) : (
          <Text backgroundColor={AGENT_COLOR_TO_THEME_COLOR[selectedValue]} color="inverseText" bold>
            {' '}
            @{agentName}{' '}
          </Text>
        )}
      </Box>
    </Box>
  );
}
