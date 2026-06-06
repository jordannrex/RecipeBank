"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const CROP_SIZE = 256; // visible crop circle diameter in px
const OUTPUT_SIZE = 128; // output JPEG size in px

type Props = {
  src: string;
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
};

export function ImageCropDialog({ src, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  /** Scale so the smaller dimension exactly fills CROP_SIZE (cover). */
  function coverScale(w: number, h: number) {
    return CROP_SIZE / Math.min(w, h);
  }

  /** Keep offset within bounds so image always covers the crop circle. */
  function clamp(ox: number, oy: number, w: number, h: number, z: number) {
    const cs = coverScale(w, h);
    const dw = w * cs * z;
    const dh = h * cs * z;
    const mx = Math.max(0, (dw - CROP_SIZE) / 2);
    const my = Math.max(0, (dh - CROP_SIZE) / 2);
    return { x: Math.max(-mx, Math.min(mx, ox)), y: Math.max(-my, Math.min(my, oy)) };
  }

  function onImgLoad() {
    const img = imgRef.current!;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setLoaded(true);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function startDrag(cx: number, cy: number) {
    drag.current = { sx: cx, sy: cy, ox: offset.x, oy: offset.y };
  }
  function moveDrag(cx: number, cy: number) {
    if (!drag.current) return;
    const raw = { x: drag.current.ox + cx - drag.current.sx, y: drag.current.oy + cy - drag.current.sy };
    setOffset(clamp(raw.x, raw.y, naturalSize.w, naturalSize.h, zoom));
  }
  function endDrag() { drag.current = null; }

  function handleZoom(z: number) {
    const next = Math.max(1, Math.min(4, z));
    setZoom(next);
    setOffset((o) => clamp(o.x, o.y, naturalSize.w, naturalSize.h, next));
  }

  function cropAndConfirm() {
    const img = imgRef.current;
    if (!img || !loaded) return;
    const { w: nw, h: nh } = naturalSize;
    const cs = coverScale(nw, nh);
    const dw = nw * cs * zoom;
    const dh = nh * cs * zoom;
    // Top-left of image within the CROP_SIZE container
    const imgLeft = (CROP_SIZE - dw) / 2 + offset.x;
    const imgTop  = (CROP_SIZE - dh)  / 2 + offset.y;
    // Map the CROP_SIZE viewport back to source pixels
    const srcX = -imgLeft * (nw / dw);
    const srcY = -imgTop  * (nh / dh);
    const srcW =  CROP_SIZE * (nw / dw);
    const srcH =  CROP_SIZE * (nh / dh);

    const canvas = document.createElement("canvas");
    canvas.width  = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    onConfirm(canvas.toDataURL("image/jpeg", 0.85));
  }

  // Current display dimensions
  const cs  = coverScale(naturalSize.w, naturalSize.h);
  const dw  = naturalSize.w * cs * zoom;
  const dh  = naturalSize.h * cs * zoom;
  const top  = (CROP_SIZE - dh) / 2 + offset.y;
  const left = (CROP_SIZE - dw) / 2 + offset.x;

  return (
    <Dialog open onClose={onCancel} title="Crop Photo">
      <div className="space-y-5">
        <p className="text-sm text-muted">Drag to reposition · Scroll or slide to zoom</p>

        {/* Circular crop viewport */}
        <div className="flex justify-center">
          <div
            className="relative overflow-hidden rounded-full border-2 border-highlight select-none cursor-grab active:cursor-grabbing"
            style={{ width: CROP_SIZE, height: CROP_SIZE }}
            onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
            onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onTouchStart={(e) => { const t = e.touches[0]; startDrag(t.clientX, t.clientY); }}
            onTouchMove={(e) => { e.preventDefault(); const t = e.touches[0]; moveDrag(t.clientX, t.clientY); }}
            onTouchEnd={endDrag}
            onWheel={(e) => { e.preventDefault(); handleZoom(zoom + (e.deltaY > 0 ? -0.1 : 0.1)); }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt="Crop preview"
              draggable={false}
              onLoad={onImgLoad}
              style={{ position: "absolute", width: dw, height: dh, top, left, pointerEvents: "none", maxWidth: "none" }}
            />
            {!loaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-card-hover">
                <p className="text-sm text-muted">Loading…</p>
              </div>
            )}
          </div>
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3">
          <svg className="h-3.5 w-3.5 flex-shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35M11 8v6M8 11h6" />
          </svg>
          <input
            type="range" min="1" max="4" step="0.02"
            value={zoom}
            onChange={(e) => handleZoom(parseFloat(e.target.value))}
            className="flex-1 accent-highlight"
            aria-label="Zoom level"
          />
          <svg className="h-5 w-5 flex-shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35M11 8v6M8 11h6" />
          </svg>
        </div>

        <div className="flex gap-2">
          <Button type="button" onClick={cropAndConfirm} disabled={!loaded}>
            Crop &amp; Use
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
