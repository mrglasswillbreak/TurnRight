import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  // Windows WebKit's software renderer needs longer for cold map initialization.
  timeout: 120000,
  expect: { timeout: 30000 },
  grep: /phone survey|motion assistance|drawing session.*touch|public phone|editor reliability|building appearance phone/,
  use: {
    ...base.use,
    browserName: 'webkit',
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
    launchOptions: {},
  },
});
