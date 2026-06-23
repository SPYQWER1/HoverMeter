
## 2025-06-23 Task 1 Scaffold Incident
During Task 1 (Tauri scaffold), the `.omo/plans/` directory and `boulder.json` were accidentally removed.
Root cause unknown — possibly `npm create tauri-app@latest .` overwrote/cleaned hidden directories.
Recovery action: recreated `.omo/plans/hovermeter.md`, `.omo/boulder.json`, and all Task 0 evidence/spike files from earlier reads.
Lesson: back up .omo state before running destructive scaffold commands in the project root.
Subsequent cargo builds require environment:
  export PATH="/tmp/pkgconf-install/usr/bin:$HOME/.cargo/bin:$PATH"
  export LD_LIBRARY_PATH="/tmp/pkgconf-install/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH"
  export PKG_CONFIG_PATH="/tmp/pkgconf-install/usr/lib/x86_64-linux-gnu/pkgconfig:/tmp/pkgconf-install/usr/share/pkgconfig:$PKG_CONFIG_PATH"
