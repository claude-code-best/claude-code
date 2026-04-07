import * as React from 'react';
import { useEffect, useState } from 'react';
import { Box } from '@anthropic/ink';
import { getInitialSettings } from '../../utils/settings/settings.js';
import { Clawd, RAINCODE_SCENE_HEIGHT, type ClawdPose } from './Clawd.js';

const FRAMES: readonly ClawdPose[] = ['default', 'look-left', 'default', 'look-right', 'default', 'arms-up'];
const FRAME_MS = 280;

/**
 * A lightweight ambient animation for the startup scene. The scene gently
 * cycles rain positions and a soft solar pulse so the header feels alive
 * without needing a click target.
 */
export function AnimatedClawd(): React.ReactNode {
  const pose = useClawdAnimation();
  return (
    <Box height={RAINCODE_SCENE_HEIGHT} flexDirection="column">
      <Box flexShrink={0}>
        <Clawd pose={pose} />
      </Box>
    </Box>
  );
}

function useClawdAnimation(): ClawdPose {
  const [reducedMotion] = useState(() => getInitialSettings().prefersReducedMotion ?? false);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => {
      setFrameIndex(current => (current + 1) % FRAMES.length);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [reducedMotion]);

  return reducedMotion ? 'default' : (FRAMES[frameIndex] ?? 'default');
}
