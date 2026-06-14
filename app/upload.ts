import type { PickedFile } from './FolderDrop'

// Upload a design folder one file per request, with retries. Small requests
// survive a flaky proxy/VPN far better than one giant multipart upload.
export async function uploadDesign(
  slug: string,
  files: PickedFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    const fd = new FormData()
    fd.append('files', files[i].file)
    fd.append('paths', JSON.stringify([files[i].path]))
    if (i === 0) fd.append('reset', 'true')

    let ok = false
    let lastErr = ''
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const res = await fetch(`/api/pages/${slug}/files`, { method: 'POST', body: fd })
        if (res.ok) ok = true
        else lastErr = (await res.json().catch(() => ({}))).error || `status ${res.status}`
      } catch (e) {
        lastErr = (e as Error).message
      }
    }
    if (!ok) throw new Error(`Upload failed on "${files[i].path}": ${lastErr}`)
    onProgress?.(i + 1, files.length)
  }
}
