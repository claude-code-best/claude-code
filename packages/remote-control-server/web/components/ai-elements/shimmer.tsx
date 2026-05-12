'use client';

import { cn } from '../../src/lib/utils';
import { motion } from 'motion/react';
import { type ElementType, type JSX, memo } from 'react';

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

const ShimmerComponent = ({ children, as: Component = 'p', className, duration = 2 }: TextShimmerProps) => {
  const MotionComponent = motion.create(Component as keyof JSX.IntrinsicElements);

  return (
    <MotionComponent
      animate={{ opacity: [0.5, 1, 0.5] }}
      className={cn('relative inline-block text-muted-foreground', className)}
      transition={{
        repeat: Number.POSITIVE_INFINITY,
        duration,
        ease: 'easeInOut',
      }}
    >
      {children}
    </MotionComponent>
  );
};

export const Shimmer = memo(ShimmerComponent);
