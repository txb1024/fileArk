//! 文件复制到系统剪贴板（CF_HDROP 格式）
//!
//! 仅提供 copy_files_to_clipboard，供 Ctrl+C / 右键复制使用。
//! 文件拖出到外部应用的功能因 Tauri WebView2 架构限制无法可靠实现，已移除。

#![cfg(target_os = "windows")]

use windows::Win32::Foundation::*;
use windows::Win32::System::DataExchange::*;
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalUnlock,
    GMEM_MOVEABLE, GLOBAL_ALLOC_FLAGS,
};

// 手动常量
const CF_HDROP_VAL: u32 = 15;
const GMEM_DDESHARE_VAL: u32 = 0x2000;

#[repr(C)]
struct DropFiles {
    p_files: u32,
    pt: POINT,
    f_nc: i32,
    f_wide: i32,
}

unsafe fn build_hdrop(paths: &[String]) -> std::result::Result<HGLOBAL, String> {
    let header_sz = std::mem::size_of::<DropFiles>();
    let mut total_wchars: usize = 1;
    for p in paths { total_wchars += p.encode_utf16().count() + 1; }
    let total_bytes = header_sz + total_wchars * 2;

    let flags = GLOBAL_ALLOC_FLAGS(GMEM_MOVEABLE.0 | GMEM_DDESHARE_VAL);
    let hglobal = GlobalAlloc(flags, total_bytes)
        .map_err(|e| format!("GlobalAlloc: {e}"))?;

    let ptr = GlobalLock(hglobal);
    if ptr.is_null() {
        let _ = GlobalFree(Some(hglobal));
        return Err("GlobalLock 失败".into());
    }

    let df = &mut *(ptr as *mut DropFiles);
    df.p_files = header_sz as u32;
    df.pt = POINT::default();
    df.f_nc = 0;
    df.f_wide = 1;

    let fp = ptr.add(header_sz) as *mut u16;
    let mut off: usize = 0;
    for p in paths {
        let wide: Vec<u16> = p.encode_utf16().chain(std::iter::once(0)).collect();
        std::ptr::copy_nonoverlapping(wide.as_ptr(), fp.add(off), wide.len());
        off += wide.len();
    }
    *fp.add(off) = 0;
    let _ = GlobalUnlock(hglobal);
    Ok(hglobal)
}

pub fn copy_files_to_clipboard(paths: &[String]) -> std::result::Result<(), String> {
    unsafe {
        let hdrop = build_hdrop(paths)?;
        OpenClipboard(Some(HWND(std::ptr::null_mut())))
            .map_err(|e| format!("OpenClipboard: {e}"))?;
        if let Err(e) = EmptyClipboard() {
            let _ = CloseClipboard();
            let _ = GlobalFree(Some(hdrop));
            return Err(format!("EmptyClipboard: {e}"));
        }
        let rr = SetClipboardData(CF_HDROP_VAL, Some(HANDLE(hdrop.0)));
        let _ = CloseClipboard();
        if let Err(e) = rr {
            let _ = GlobalFree(Some(hdrop));
            return Err(format!("SetClipboardData: {e}"));
        }
        Ok(())
    }
}
