import type { BlockSuiteFlags } from '@blocksuite/affine/shared/services';

export type FlagInfo = {
  displayName: string;
  description?: string;
  configurable?: boolean;
  defaultState?: boolean; // default to open and not controlled by user
  /**
   * hide in the feature flag settings, but still can be controlled by the code
   */
  hide?: boolean;
} & (
  | {
      category: 'affine';
    }
  | {
      category: 'blocksuite';
      bsFlag: keyof BlockSuiteFlags;
    }
);
