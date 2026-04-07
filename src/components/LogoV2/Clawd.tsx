import * as React from 'react';
import { Box, Text } from '@anthropic/ink';

export type ClawdPose = 'default' | 'arms-up' | 'look-left' | 'look-right';

export const RAINCODE_SCENE_WIDTH = 26;
export const RAINCODE_SCENE_HEIGHT = 5;

type Props = {
  pose?: ClawdPose;
};

type Segment = {
  color?: string;
  text: string;
};

type Scene = Segment[][];

const SCENES: Record<ClawdPose, Scene> = {
  default: [
    [{ color: 'chromeYellow', text: ' \\ | / ' }, { text: '   ' }, { color: 'rainbow_red', text: '╭──────────╮' }],
    [
      { color: 'chromeYellow', text: '  \\*/  ' },
      { text: ' ' },
      { color: 'rainbow_orange', text: '╭──╯' },
      { color: 'rainbow_yellow', text: '╭──────╮' },
      { color: 'rainbow_green', text: '╰──╮' },
    ],
    [
      { color: 'chromeYellow', text: '  /_\\  ' },
      { text: ' ' },
      { color: 'rainbow_blue', text: '╰──╮' },
      { color: 'rainbow_indigo', text: '╰──────╯' },
      { color: 'rainbow_violet', text: '╭──╯' },
    ],
    [
      { text: '            ' },
      { color: 'rainbow_blue', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_indigo', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_blue', text: '╲' },
    ],
    [
      { text: '              ' },
      { color: 'rainbow_indigo', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_blue', text: '╲' },
    ],
  ],
  'look-left': [
    [{ color: 'chromeYellow', text: ' \\ | / ' }, { text: '   ' }, { color: 'rainbow_red', text: '╭──────────╮' }],
    [
      { color: 'chromeYellow', text: '  \\*/  ' },
      { text: ' ' },
      { color: 'rainbow_orange', text: '╭──╯' },
      { color: 'rainbow_yellow', text: '╭──────╮' },
      { color: 'rainbow_green', text: '╰──╮' },
    ],
    [
      { color: 'chromeYellow', text: '  /_\\  ' },
      { text: ' ' },
      { color: 'rainbow_blue', text: '╰──╮' },
      { color: 'rainbow_indigo', text: '╰──────╯' },
      { color: 'rainbow_violet', text: '╭──╯' },
    ],
    [
      { text: '          ' },
      { color: 'rainbow_blue', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_indigo', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_blue', text: '╲' },
    ],
    [
      { text: '            ' },
      { color: 'rainbow_indigo', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_blue', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_indigo', text: '╲' },
    ],
  ],
  'look-right': [
    [{ color: 'chromeYellow', text: ' \\ | / ' }, { text: '   ' }, { color: 'rainbow_red', text: '╭──────────╮' }],
    [
      { color: 'chromeYellow', text: '  \\*/  ' },
      { text: ' ' },
      { color: 'rainbow_orange', text: '╭──╯' },
      { color: 'rainbow_yellow', text: '╭──────╮' },
      { color: 'rainbow_green', text: '╰──╮' },
    ],
    [
      { color: 'chromeYellow', text: '  /_\\  ' },
      { text: ' ' },
      { color: 'rainbow_blue', text: '╰──╮' },
      { color: 'rainbow_indigo', text: '╰──────╯' },
      { color: 'rainbow_violet', text: '╭──╯' },
    ],
    [
      { text: '              ' },
      { color: 'rainbow_blue', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_indigo', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_blue', text: '╲' },
    ],
    [
      { text: '                ' },
      { color: 'rainbow_indigo', text: '╲' },
      { text: '  ' },
      { color: 'rainbow_blue', text: '╲' },
    ],
  ],
  'arms-up': [
    [{ color: 'chromeYellow', text: ' \\ .*. / ' }, { text: ' ' }, { color: 'rainbow_red', text: '╭──────────╮' }],
    [
      { color: 'chromeYellow', text: '  <O>  ' },
      { text: ' ' },
      { color: 'rainbow_orange', text: '╭──╯' },
      { color: 'rainbow_yellow', text: '╭──────╮' },
      { color: 'rainbow_green', text: '╰──╮' },
    ],
    [
      { color: 'chromeYellow', text: '  /_\\  ' },
      { text: ' ' },
      { color: 'rainbow_blue', text: '╰──╮' },
      { color: 'rainbow_indigo', text: '╰──────╯' },
      { color: 'rainbow_violet', text: '╭──╯' },
    ],
    [
      { text: '            ' },
      { color: 'rainbow_blue', text: '╲' },
      { text: ' ' },
      { color: 'rainbow_indigo', text: '╲' },
      { text: ' ' },
      { color: 'rainbow_blue', text: '╲' },
      { text: ' ' },
      { color: 'rainbow_indigo', text: '╲' },
    ],
    [
      { text: '              ' },
      { color: 'rainbow_blue', text: '╲' },
      { text: ' ' },
      { color: 'rainbow_indigo', text: '╲' },
      { text: ' ' },
      { color: 'rainbow_blue', text: '╲' },
    ],
  ],
};

export function Clawd({ pose = 'default' }: Props = {}): React.ReactNode {
  const scene = SCENES[pose];
  return (
    <Box flexDirection="column">
      {scene.map((row, rowIndex) => (
        <Text key={rowIndex}>
          {row.map((segment, segmentIndex) => (
            <Text key={`${rowIndex}-${segmentIndex}`} color={segment.color}>
              {segment.text}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  );
}
