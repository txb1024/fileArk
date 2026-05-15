import { convertFileSrc } from "@tauri-apps/api/core";
import { getFileIcon } from "../../utils";

export function AudioPreview({ path, name }: { path: string; name: string }) {
  const src = convertFileSrc(path);
  const icon = getFileIcon(name, false, 48);
  return (
    <div className="preview-audio-container">
      <div className="audio-artwork">{icon}</div>
      <div className="audio-name">{name}</div>
      <audio src={src} controls className="preview-audio" />
    </div>
  );
}
