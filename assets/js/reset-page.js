import { initShell, initAuthForms, watchRecoveryEvents } from './auth.js';

await initShell();
watchRecoveryEvents();
initAuthForms();
