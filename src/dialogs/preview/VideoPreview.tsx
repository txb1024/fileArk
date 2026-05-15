import { convertFileSrc } from "@tauri-apps/api/core";

export function VideoPreview({ path }: { path: string }) {
  const src = convertFileSrc(path);
  return (
    <div className="preview-video-container">
      <video src={src} controls className="preview-video" />
    </div>
  );
}
