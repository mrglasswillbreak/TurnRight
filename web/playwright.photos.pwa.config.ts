import { defineConfig } from '@playwright/test';
import base from './playwright.pwa.config';
export default defineConfig({ ...base, grep: /prepared offline image/ });
