// 预览相关共享工具

export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64ToText(base64: string): string {
  const bytes = base64ToUint8Array(base64);
  // BOM 检测
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function extToLang(ext: string): string | undefined {
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    kt: "kotlin",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    h: "c",
    html: "xml",
    xml: "xml",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    sql: "sql",
    sh: "bash",
    bat: "bat",
    ps1: "powershell",
    md: "markdown",
    markdown: "markdown",
    dockerfile: "dockerfile",
    makefile: "makefile",
    swift: "swift",
    php: "php",
    lua: "lua",
    r: "r",
  };
  return map[ext];
}

export function extLabel(ext: string): string {
  const map: Record<string, string> = {
    pdf: "PDF 文档",
    docx: "Word 文档",
    doc: "Word 文档（旧版）",
    xlsx: "Excel 表格",
    xls: "Excel 表格",
    csv: "CSV 表格",
    pptx: "PowerPoint 演示",
    ppt: "PowerPoint 演示",
    png: "PNG 图片",
    jpg: "JPEG 图片",
    jpeg: "JPEG 图片",
    gif: "GIF 图片",
    svg: "SVG 矢量图",
    webp: "WebP 图片",
    ico: "图标文件",
    bmp: "BMP 图片",
    mp4: "MP4 视频",
    avi: "AVI 视频",
    mov: "MOV 视频",
    mkv: "MKV 视频",
    webm: "WebM 视频",
    mp3: "MP3 音频",
    wav: "WAV 音频",
    flac: "FLAC 音频",
    aac: "AAC 音频",
    ogg: "OGG 音频",
    m4a: "M4A 音频",
    md: "Markdown",
    markdown: "Markdown",
    txt: "纯文本",
    log: "日志文件",
    js: "JavaScript",
    ts: "TypeScript",
    jsx: "JSX",
    tsx: "TSX",
    html: "HTML 网页",
    htm: "HTML 网页",
    css: "CSS 样式",
    scss: "SCSS 样式",
    json: "JSON 数据",
    xml: "XML 数据",
    yaml: "YAML 配置",
    yml: "YAML 配置",
    py: "Python 代码",
    rs: "Rust 代码",
    go: "Go 代码",
    java: "Java 代码",
    zip: "ZIP 压缩包",
    jar: "Java 包",
    apk: "Android 安装包",
    war: "Web 归档",
    ipa: "iOS 安装包",
    xpi: "扩展包",
    rar: "RAR 压缩包",
    "7z": "7Z 压缩包",
    tar: "TAR 归档",
    gz: "GZ 压缩",
    exe: "可执行文件",
    msi: "安装程序",
    dll: "动态链接库",
    epub: "EPUB 电子书",
    ipynb: "Jupyter 笔记本",
    srt: "SRT 字幕",
    vtt: "WebVTT 字幕",
    ass: "ASS 字幕",
    ssa: "SSA 字幕",
    eml: "电子邮件",
    stl: "STL 模型",
    obj: "OBJ 模型",
    gltf: "glTF 模型",
    glb: "GLB 模型",
    ttf: "TrueType 字体",
    otf: "OpenType 字体",
    woff: "WOFF 字体",
    woff2: "WOFF2 字体",
    geojson: "GeoJSON 数据",
    kml: "KML 地理标记",
    rtf: "RTF 富文本",
  };
  return map[ext] || `${ext.toUpperCase()} 文件`;
}
