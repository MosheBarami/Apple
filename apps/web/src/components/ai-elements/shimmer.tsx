"use client";

// Vendored from Vercel AI Elements (Apache-2.0), packages/elements/src/shimmer.tsx at
// 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd. The verbatim original is ./upstream/shimmer.tsx.txt
// and ./NOTICE lists the local substitutions: motion/react's animated element is replaced by the
// requested element carrying `.ai-elements-shimmer`, whose sweep is a CSS animation (reasoning.css)
// driven by the same duration and spread props, with a reduced-motion opt-out.
import { memo, useMemo, type CSSProperties, type ElementType } from 'react';
import { cn } from './lib/utils';

export interface TextShimmerProps {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

const ShimmerComponent = ({
  children,
  as: Component = 'p',
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) => {
  const dynamicSpread = useMemo(() => (children?.length ?? 0) * spread, [children, spread]);
  const style = {
    '--ai-shimmer-duration': `${duration}s`,
    '--ai-shimmer-spread': `${dynamicSpread}px`,
  } as CSSProperties;

  return (
    <Component className={cn('ai-elements-shimmer', className)} style={style}>
      {children}
    </Component>
  );
};

export const Shimmer = memo(ShimmerComponent);
