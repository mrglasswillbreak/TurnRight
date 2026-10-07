import { defineConfig } from '@playwright/test';
import base from './playwright.docs.config';
export default defineConfig({
  ...base,
  expect: { timeout: 30000 },
  grep: /redesign documentation gallery/,
});
