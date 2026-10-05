import { useEffect } from 'react';
/** Specialist canvases retain their own engines and focus trap inside the editor frame. */
export function useEditorFocus(active: boolean) {
  useEffect(() => {
    if (!active || !document.querySelector('.unified-editor')) return;
    const count = Number(document.body.dataset.editorFocus || 0) + 1;
    document.body.dataset.editorFocus = String(count);
    return () => {
      const next = Number(document.body.dataset.editorFocus || 1) - 1;
      if (next) document.body.dataset.editorFocus = String(next);
      else delete document.body.dataset.editorFocus;
    };
  }, [active]);
}
