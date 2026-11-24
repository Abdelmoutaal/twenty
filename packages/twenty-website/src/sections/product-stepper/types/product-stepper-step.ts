import { type MessageDescriptor } from '@lingui/core';
import { type ComponentType } from 'react';

import { type INFORMATIVE_MARKS } from '@/icons';

export type ProductStepperStep = {
  body: MessageDescriptor;
  heading: MessageDescriptor;
  icon: keyof typeof INFORMATIVE_MARKS;
  // Scrubbed visuals get `progress`: how far the reader has scrolled through
  // the step (0 to 1), only while the stepper scrolls (md and up), like
  // HomeStepper's Lottie. Others keep stable props and skip scroll re-renders.
  scrubbed?: boolean;
  Visual: ComponentType<{ active: boolean; progress?: number }>;
};
