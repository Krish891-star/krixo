import { convertHandlers } from './pro-convert.js';
import { manageHandlers } from './pro-manage.js';
import { extraHandlers } from './pro-extra.js';

const handlers = { ...convertHandlers, ...manageHandlers, ...extraHandlers };

export function createProRunner(api) {
  return async function runProTool(tool) {
    const handler = handlers[tool];
    if (!handler) return false;
    /* HTML to PDF can run from pasted markup without an uploaded file.
       Clear any previous result before requireFiles() shows a new error. */
    api.resetResult();
    api.clearStatus();
    let files;
    if (tool === 'html-to-pdf') files = window.selectedFiles || [];
    else files = api.requireFiles();
    if (!files || (!files.length && tool !== 'html-to-pdf')) return true;
    const token = api.nextJob();
    const button = api.$('#process-btn');
    api.setBusy(button, true, 'Processing…');
    try {
      await handler({
        files,
        file: files[0],
        token,
        isCurrent: () => api.currentJob(token),
        $: api.$,
        $$: api.$$,
        setStatus: api.setStatus,
        clearStatus: api.clearStatus,
        showResult: api.showResult,
        resetResult: api.resetResult,
        setBusy: api.setBusy,
        requireFiles: api.requireFiles,
        friendlyError: api.friendlyError,
        nextJob: api.nextJob,
        escapeHtml: api.escapeHtml,
        fmtBytes: api.fmtBytes,
        downloadBlob: api.downloadBlob
      });
      /* Keep tool-specific success details; only add a fallback when the handler did not. */
      if (api.currentJob(token) && !api.$('#tool-status')?.classList.contains('success')) {
        api.setStatus('Done. Your file was processed on this device.', 'success');
      }
    } catch (error) {
      if (api.currentJob(token)) api.setStatus(api.friendlyError(error, 'Could not process this file.'), 'error');
    } finally {
      if (api.currentJob(token)) api.setBusy(button, false);
    }
    return true;
  };
}
