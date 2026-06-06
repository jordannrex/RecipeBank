"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AvatarDisplay, contrastText } from "@/components/ui/avatar-display";
import { ImageCropDialog } from "@/components/settings/image-crop-dialog";
import { cn } from "@/lib/utils";
import type { AuthUser, AvatarConfig } from "@/types/auth";

const PRESET_COLORS = [
  "#ff3131", "#e8b8b8", "#6366f1", "#0ea5e9",
  "#22c55e", "#f59e0b", "#ec4899", "#1a1a2e",
];

type Tab = "initials" | "photo";

type Props = { user: AuthUser };

export function AvatarPicker({ user }: Props) {
  const router = useRouter();

  const existing = user.avatarConfig;
  const defaultLetter = user.displayName.trim()[0]?.toUpperCase() ?? "?";

  const [tab, setTab] = useState<Tab>(existing?.type === "photo" ? "photo" : "initials");
  const [letter, setLetter]   = useState(existing?.type === "initials" ? existing.letter  : defaultLetter);
  const [bgColor, setBgColor] = useState(existing?.type === "initials" ? existing.bgColor : "#ff3131");
  const [photoUrl, setPhotoUrl] = useState(existing?.type === "photo" ? existing.url : (user.avatarUrl ?? ""));

  // Crop dialog
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const [saving, setSaving]   = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Derive safe preview — never produce { type:"photo", url:"" }
  const preview: AvatarConfig =
    tab === "initials" || !photoUrl
      ? { type: "initials", letter: letter || defaultLetter, bgColor }
      : { type: "photo", url: photoUrl };

  function openFilePicker() { fileInputRef.current?.click(); }

  function handleFileInput(file: File) {
    if (!file.type.startsWith("image/")) { setError("Please select an image file."); return; }
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
  }

  function onCropConfirm(dataUrl: string) {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    setPhotoUrl(dataUrl);
    setTab("photo");
  }

  function onCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function save() {
    if (tab === "photo" && !photoUrl) { setError("No photo selected."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: preview }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreFromHistory(config: AvatarConfig) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/user/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) { setError("Failed to restore"); return; }
      if (config.type === "initials") {
        setTab("initials"); setLetter(config.letter); setBgColor(config.bgColor);
      } else {
        setTab("photo"); setPhotoUrl(config.url);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {cropSrc && (
        <ImageCropDialog src={cropSrc} onConfirm={onCropConfirm} onCancel={onCropCancel} />
      )}

      <div className="space-y-6">
        {/* Preview */}
        <div className="flex items-center gap-4">
          <AvatarDisplay config={preview} fallback={defaultLetter} size={72} />
          <div>
            <p className="text-sm font-medium text-text">Preview</p>
            <p className="text-xs text-muted">This is how your avatar appears in the app.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-border bg-card p-1 w-fit">
          {(["initials", "photo"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                tab === t
                  ? "bg-highlight text-brand-white"
                  : "text-text/60 hover:bg-card-hover hover:text-text",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Initials tab */}
        {tab === "initials" && (
          <div className="space-y-4">
            <div>
              <label htmlFor="avatar-letter" className="mb-1 block text-sm font-medium text-text">Letter</label>
              <input
                id="avatar-letter"
                type="text"
                maxLength={2}
                value={letter}
                onChange={(e) => setLetter(e.target.value.toUpperCase().slice(0, 2))}
                placeholder={defaultLetter}
                className="w-20 rounded-lg border border-border bg-card px-3 py-2 text-center text-lg font-bold text-text outline-none focus:border-highlight focus:ring-2 focus:ring-highlight/20"
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-text">Background color</p>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setBgColor(color)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform hover:scale-110",
                      bgColor === color ? "border-text scale-110" : "border-transparent",
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={color}
                  />
                ))}
                {/* Custom color swatch */}
                <label
                  className={cn(
                    "relative h-8 w-8 cursor-pointer rounded-full border-2 overflow-hidden transition-transform hover:scale-110",
                    !PRESET_COLORS.includes(bgColor) ? "border-text scale-110" : "border-border",
                  )}
                  title="Custom color"
                >
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                  <span
                    className="flex h-full w-full items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: !PRESET_COLORS.includes(bgColor) ? bgColor : "#e4e4e7",
                      color: !PRESET_COLORS.includes(bgColor) ? contrastText(bgColor) : "#71717a",
                    }}
                  >
                    +
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Photo tab */}
        {tab === "photo" && (
          <div className="space-y-4">
            {/* Drop / upload zone */}
            <div
              className={cn(
                "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors cursor-pointer",
                dragOver ? "border-highlight bg-highlight/5" : "border-border hover:border-highlight/50 hover:bg-card-hover",
              )}
              onClick={openFilePicker}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) handleFileInput(file);
              }}
            >
              {photoUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="Current photo"
                    className="h-20 w-20 rounded-full object-cover border-2 border-border"
                  />
                  <p className="text-xs text-muted">Click or drop to replace</p>
                </>
              ) : (
                <>
                  <svg className="h-8 w-8 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <p className="text-sm font-medium text-text">Upload a photo</p>
                  <p className="text-xs text-muted">Drag & drop or click to browse</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileInput(f); e.target.value = ""; }}
                aria-label="Upload avatar image"
              />
            </div>

            {/* URL fallback */}
            <div>
              <p className="mb-1 text-xs text-muted">Or paste an image URL</p>
              <input
                id="avatar-photo-url"
                type="url"
                value={photoUrl.startsWith("data:") ? "" : photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-highlight focus:ring-2 focus:ring-highlight/20"
              />
            </div>

            {/* Preview for pasted URL (not data URI) */}
            {photoUrl && !photoUrl.startsWith("data:") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="URL preview"
                className="h-16 w-16 rounded-full object-cover border border-border"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Avatar"}
          </Button>
          {saved && <span className="text-sm text-emerald-600">Avatar updated.</span>}
        </div>

        {/* Recent avatars */}
        {user.avatarHistory.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-text">Recent</p>
            <div className="flex gap-3">
              {user.avatarHistory.map((config, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => restoreFromHistory(config)}
                  disabled={saving}
                  className="transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-highlight rounded-full"
                  aria-label={`Restore avatar ${i + 1}`}
                >
                  <AvatarDisplay config={config} fallback={defaultLetter} size={40} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
