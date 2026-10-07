import { defineConfig } from '@playwright/test';
import base from './playwright.docs.config';
export default defineConfig({
  ...base,
  grep: /redesign documentation gallery/,
});
