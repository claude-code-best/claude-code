import React from 'react';
import { Box, Text } from '@anthropic/ink';
import { AnimatedClawd } from './AnimatedClawd.js';

const WELCOME_V2_WIDTH = 58;
const WELCOME_SEPARATOR = '·'.repeat(30);

export function WelcomeV2(): React.ReactNode {
  return (
    <Box width={WELCOME_V2_WIDTH} flexDirection="column" alignItems="center">
      <Text>
        <Text color="rainbow_blue">Welcome to </Text>
        <RainbowWord />
        <Text> </Text>
        <Text dimColor>v{MACRO.VERSION}</Text>
      </Text>
      <Text dimColor>{WELCOME_SEPARATOR}</Text>
      <Text dimColor>sunlight, rain, and a calmer terminal</Text>
      <Box
        marginTop={1}
        paddingX={4}
        paddingY={1}
        borderStyle="round"
        borderColor="rainbow_blue"
        flexDirection="column"
        alignItems="center"
      >
        <AnimatedClawd />
        <Box marginTop={1} flexDirection="column" alignItems="center">
          <Text dimColor>light after the storm, flow after the fix</Text>
          <Text color="rainbow_green">soft rain on one side, warm sun on the other</Text>
        </Box>
      </Box>
    </Box>
  );
}

function RainbowWord(): React.ReactNode {
  return (
    <>
      <Text color="rainbow_red">R</Text>
      <Text color="rainbow_orange">a</Text>
      <Text color="rainbow_yellow">i</Text>
      <Text color="rainbow_green">n</Text>
      <Text color="rainbow_blue">c</Text>
      <Text color="rainbow_indigo">o</Text>
      <Text color="rainbow_violet">d</Text>
      <Text color="rainbow_blue">e</Text>
    </>
  );
}
