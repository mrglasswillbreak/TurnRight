import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  grep: /phone survey/,
  use: {
    ...base.use,
    browserName: 'webkit',
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    launchOptions: {},
  },
});
