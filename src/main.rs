#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod assets;
mod ebook;
mod image_pdf;
mod md_docx;
mod pdf;
mod server;
mod state;
mod tools;

use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::{Icon, Window, WindowBuilder};
use wry::WebViewBuilder;

use crate::state::AppState;

fn main() {
    if let Err(error) = run() {
        show_error(&error);
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let state = AppState::new()?;
    let port = start_server(state)?;
    let url = format!("http://127.0.0.1:{port}/");

    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("IT-Tools 工具箱")
        .with_window_icon(app_icon())
        .with_inner_size(LogicalSize::new(1280.0, 860.0))
        .with_min_inner_size(LogicalSize::new(900.0, 600.0))
        .build(&event_loop)
        .map_err(|error| format!("无法创建窗口: {error}"))?;
    theme_title_bar(&window);

    // 用侧边栏同色做 WebView 底色：首帧到来前不会闪白，视觉上更像原生深色应用
    let _webview = WebViewBuilder::new()
        .with_url(&url)
        .with_background_color((24, 34, 52, 255))
        .build(&window)
        .map_err(|error| {
            format!(
                "无法启动 WebView2: {error}\n\n请确认系统已安装 Microsoft Edge WebView2 运行时。"
            )
        })?;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent {
            event: WindowEvent::CloseRequested,
            ..
        } = event
        {
            *control_flow = ControlFlow::Exit;
        }
    });
}

/// 窗口/任务栏图标：由 `scripts/make-icon.ps1` 从 static/img/logo.svg 生成的 256px PNG。
/// 直接解码 PNG 得到 RGBA，避免为图标额外引入图片解码依赖。
fn app_icon() -> Option<Icon> {
    const ICON_PNG: &[u8] = include_bytes!("../static/img/logo-256.png");
    let image = image::load_from_memory_with_format(ICON_PNG, image::ImageFormat::Png).ok()?;
    let image = image.to_rgba8();
    let (width, height) = image.dimensions();
    Icon::from_rgba(image.into_raw(), width, height).ok()
}

/// 标题栏跟随应用深色主题：Windows 11 直接改标题栏/文字/边框颜色，
/// Windows 10 走沉浸式深色模式（不受支持的属性会被系统忽略，因此逐个尝试）。
#[cfg(windows)]
fn theme_title_bar(window: &Window) {
    use tao::platform::windows::WindowExtWindows;

    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_CAPTION_COLOR: u32 = 35;
    const DWMWA_TEXT_COLOR: u32 = 36;

    let hwnd = window.hwnd() as *mut std::ffi::c_void;
    if hwnd.is_null() {
        return;
    }

    // COLORREF 排列是 0x00BBGGRR，取值与侧边栏渐变（#182234 → #0c1422）保持一致
    let caption: u32 = 0x0034_2218; // #182234
    let text: u32 = 0x00F9_F5F1; // #F1F5F9
    let border: u32 = 0x0052_3A2A; // #2A3A52
    let dark_mode: i32 = 1;

    // 属性 20 是 Win10 1903+ 的沉浸式深色模式，1809 用 19
    if !dwm_set(hwnd, 20, &dark_mode as *const i32 as *const _, 4) {
        dwm_set(hwnd, 19, &dark_mode as *const i32 as *const _, 4);
    }
    dwm_set(hwnd, DWMWA_CAPTION_COLOR, &caption as *const u32 as *const _, 4);
    dwm_set(hwnd, DWMWA_TEXT_COLOR, &text as *const u32 as *const _, 4);
    dwm_set(hwnd, DWMWA_BORDER_COLOR, &border as *const u32 as *const _, 4);
}

#[cfg(windows)]
fn dwm_set(
    hwnd: *mut std::ffi::c_void,
    attribute: u32,
    value: *const std::ffi::c_void,
    size: u32,
) -> bool {
    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: *mut std::ffi::c_void,
            attribute: u32,
            value: *const std::ffi::c_void,
            size: u32,
        ) -> i32;
    }

    unsafe { DwmSetWindowAttribute(hwnd, attribute, value, size) == 0 }
}

#[cfg(not(windows))]
fn theme_title_bar(_window: &Window) {}

fn start_server(state: AppState) -> Result<u16, String> {
    let listener =
        std::net::TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("无法监听本地端口: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("无法获取本地端口: {e}"))?
        .port();
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("无法配置本地端口: {e}"))?;

    let app = server::router(state);
    std::thread::Builder::new()
        .name("pdfmer-http".to_string())
        .spawn(move || {
            let runtime = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("failed to build tokio runtime");
            runtime.block_on(async move {
                let listener = tokio::net::TcpListener::from_std(listener)
                    .expect("failed to register local listener");
                if let Err(error) = axum::serve(listener, app).await {
                    eprintln!("HTTP server stopped: {error}");
                }
            });
        })
        .map_err(|e| format!("无法启动本地服务: {e}"))?;

    Ok(port)
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn MessageBoxW(
        hwnd: *mut std::ffi::c_void,
        text: *const u16,
        caption: *const u16,
        utype: u32,
    ) -> i32;
}

#[cfg(windows)]
fn show_error(message: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    fn wide(text: &str) -> Vec<u16> {
        OsStr::new(text)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let text = wide(&format!("IT-Tools 启动失败：\n\n{message}"));
    let caption = wide("IT-Tools");
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            0x0000_0010,
        );
    }
}

#[cfg(not(windows))]
fn show_error(message: &str) {
    eprintln!("IT-Tools 启动失败：{message}");
}

