import * as React from 'react';
import { Text } from '@anthropic/ink';
import type { Theme } from '../../utils/theme.js';

type Props = {
  char: string;
  index: number;
  glimmerIndex: number;
  messageColor: keyof Theme;
  shimmerColor: keyof Theme;
};

export function ShimmerChar({ char, index, glimmerIndex, messageColor, shimmerColor }: Props): React.ReactNode {
  const isHighlighted = index === glimmerIndex;
  const isNearHighlight = Math.abs(index - glimmerIndex) === 1;
  const shouldUseShimmer = isHighlighted || isNearHighlight;

  return <Text color={shouldUseShimmer ? shimmerColor : messageColor}>{char}</Text>;
}
