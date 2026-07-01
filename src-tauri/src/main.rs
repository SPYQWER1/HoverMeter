//! HoverMeter 可执行文件入口
//!
//! Windows release 模式下隐藏控制台窗口。

// Windows 平台：release 构建时不显示控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    hovermeter_lib::run()
}
