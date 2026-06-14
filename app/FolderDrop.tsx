'use client'

import { useRef, useState } from 'react'

export type PickedFile = { file: File; path: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFile(entry: any): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readEntries(reader: any): Promise<any[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function walk(dir: any, prefix: string, out: PickedFile[]) {
  const reader = dir.createReader()
  for (;;) {
    const batch = await readEntries(reader)
    if (!batch.length) break
    for (const e of batch) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isFile) out.push({ file: await getFile(e), path: rel })
      else if (e.isDirectory) await walk(e, rel, out)
    }
  }
}

// Drop junk like .DS_Store / hidden files.
function clean(items: PickedFile[]): PickedFile[] {
  return items.filter((i) => i.path && !i.path.split('/').some((s) => s.startsWith('.')))
}

export default function FolderDrop({
  onPick,
  busy,
}: {
  onPick: (files: PickedFile[], suggestedName?: string) => void
  busy?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [info, setInfo] = useState('')

  function deliver(items: PickedFile[], suggestedName?: string) {
    const files = clean(items)
    setInfo(files.length ? `${files.length} files ready` : 'No files found in there')
    if (files.length) onPick(files, suggestedName)
  }

  function fromInput(list: FileList) {
    const top = (list[0]?.webkitRelativePath || '').split('/')[0]
    deliver(
      Array.from(list).map((f) => ({
        file: f,
        path: (f.webkitRelativePath || f.name).split('/').slice(1).join('/') || f.name,
      })),
      top || undefined,
    )
  }

  async function fromDrop(dt: DataTransfer) {
    const entries = Array.from(dt.items)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((i) => (i as any).webkitGetAsEntry?.())
      .filter(Boolean)
    if (entries.length === 0) {
      // Fallback: plain file list (no directory structure available)
      if (dt.files?.length) fromInput(dt.files)
      return
    }
    const out: PickedFile[] = []
    let suggestedName: string | undefined
    for (const entry of entries) {
      if (entry.isDirectory) {
        if (!suggestedName) suggestedName = entry.name
        await walk(entry, '', out)
      } else if (entry.isFile) out.push({ file: await getFile(entry), path: entry.name })
    }
    deliver(out, suggestedName)
  }

  return (
    <>
      <div
        className={over ? 'dropzone over' : 'dropzone'}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          fromDrop(e.dataTransfer)
        }}
        role="button"
        tabIndex={0}
      >
        <div className="dropzone-icon">⬆</div>
        <div className="dropzone-title">
          {busy ? 'Uploading…' : 'Drag your design folder here'}
        </div>
        <div className="dropzone-sub">or click to choose a folder</div>
        {info && <div className="dropzone-info">{info}</div>}
      </div>
      <input
        ref={inputRef}
        type="file"
        hidden
        // @ts-expect-error non-standard but supported by browsers
        webkitdirectory=""
        directory=""
        multiple
        onChange={(e) => e.target.files && fromInput(e.target.files)}
      />
    </>
  )
}
