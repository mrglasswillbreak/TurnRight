/** Final cleanup for the exact recorded execution, including interruption. */
import { vercelApi } from './vercel-api.mjs';
import { cleanupTemporaryAccess } from './preview-access.mjs';
await cleanupTemporaryAccess(vercelApi);
