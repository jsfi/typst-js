import { defineConfig } from 'vite-plus';

import fmt from './oxfmt.config.ts';
import lint from './oxlint.config.ts';

/**
 * Root Vite+ config: `vp fmt` and `vp lint` read their settings from here. The settings themselves
 * stay in `oxfmt.config.ts` and `oxlint.config.ts` and are imported, so the standalone binaries,
 * editor integrations and `vp` share one definition instead of copies that can drift.
 */
export default defineConfig({ fmt, lint });
