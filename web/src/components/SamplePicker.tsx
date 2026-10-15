import { useCallback, useRef, useState } from 'react';

import { SAMPLE_CRYSTALS } from '@/data/samples';
import { useCrystalStore } from '@/store/crystal-store';

/**
 * Sample picker (plan §5-T09): preloaded-sample dropdown + .cord file upload,
 * both feeding `loadCordText` of the crystal store.
 *
 * Parse failures surface through `store.error` (line-numbered
 * {@link CordParseError} message) rendered by the page-level error banner —
 * the store keeps the previous crystal/pattern untouched, so a bad upload
 * never destroys a good result (plan §3.3 semantics). FileReader-level
 * failures (rare I/O errors) are reported by the component's own banner.
 */
export function SamplePicker() {
  const loadCordText = useCrystalStore((state) => state.loadCordText);
  const crystalName = useCrystalStore((state) => state.crystal?.name ?? null);
  const [readError, setReadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSampleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const sample = SAMPLE_CRYSTALS.find((s) => s.id === event.target.value);
      if (sample) {
        setReadError(null);
        loadCordText(sample.text);
      }
    },
    [loadCordText],
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        // readAsText yields string | ArrayBuffer; .cord is UTF-8 text.
        if (typeof reader.result === 'string') {
          setReadError(null);
          loadCordText(reader.result);
        }
      };
      reader.onerror = () => {
        setReadError(`文件读取失败：${file.name}（${reader.error?.message ?? '未知错误'}）`);
      };
      reader.readAsText(file);
      // Reset the input so re-selecting the same file fires change again.
      event.target.value = '';
    },
    [loadCordText],
  );

  return (
    <div className="sample-picker">
      <div className="field-group">
        <label htmlFor="sample-select">预置样品</label>
        <select id="sample-select" defaultValue="" onChange={handleSampleChange}>
          <option value="" disabled>
            选择样品后自动加载…
          </option>
          {SAMPLE_CRYSTALS.map((sample) => (
            <option key={sample.id} value={sample.id}>
              {sample.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-group">
        <label htmlFor="cord-upload">上传 .cord 文件</label>
        <input
          id="cord-upload"
          ref={fileInputRef}
          type="file"
          accept=".cord,text/plain"
          onChange={handleFileChange}
          className="file-input"
        />
      </div>
      <p className="sample-status text-dim">
        {crystalName ? (
          <>
            当前晶体：<span className="mono">{crystalName}</span>
          </>
        ) : (
          '尚未加载晶体结构'
        )}
      </p>
      {readError ? <p className="error-banner sample-read-error">{readError}</p> : null}
    </div>
  );
}
