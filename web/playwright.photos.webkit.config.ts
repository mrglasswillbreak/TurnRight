import { defineConfig } from '@playwright/test';
import base from './playwright.webkit.config';
export default defineConfig({
  ...base,
  grep: /offline image editor|image worker/,
});
