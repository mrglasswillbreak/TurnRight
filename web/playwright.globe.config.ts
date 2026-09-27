import { defineConfig } from '@playwright/test';
import production from './playwright.pwa.config';

// Exercise compiled CSS as well as the map; dev styles can hide transform bugs.
export default defineConfig({ ...production, grep: /globe search/ });
