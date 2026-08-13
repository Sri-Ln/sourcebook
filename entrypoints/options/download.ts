/**
 * Hands a file to the browser's downloader.
 *
 * `chrome.downloads` would need another permission, and the extension's
 * permission list is deliberately short — an anchor and an object URL do the
 * same job with nothing added to the manifest.
 *
 * Isolated in its own module so the components that call it can be tested
 * without a real browser's download machinery.
 */
export function downloadText(
  filename: string,
  contents: string,
  type = 'application/json',
): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Firefox will not act on a click for an element outside the document.
  document.body.append(link);
  link.click();
  link.remove();

  // Deferred: revoking in the same tick as the click cancels the download in
  // some browsers, and a leaked object URL is the lesser failure.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
