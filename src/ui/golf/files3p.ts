// T433, T434: saving and opening the view's files (a ghost round, a shared course) in the browser: a download, and a file picked by the player.
/** the text saved as a file the browser downloads, named `name` */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** a file the player picks, as text (null: none picked) */
export function pickText(accept = '.json,application/json'): Promise<string | null> {
  return new Promise(resolve => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files?.[0]; if (!f) { resolve(null); return; } f.text().then(resolve, () => resolve(null)); };
    i.click();
  });
}
/** a name made safe for a file name */
export const fileName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'course';
