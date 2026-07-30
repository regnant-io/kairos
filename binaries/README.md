# llama-server Binaries

Place the compiled `llama-server` (or `llama-server.exe` on Windows) binary
for your target platform in the appropriate subdirectory:

- `win-x64/llama-server.exe`       — Windows 64-bit
- `linux-x64/llama-server`         — Linux 64-bit
- `darwin-arm64/llama-server`      — macOS Apple Silicon (M1/M2/M3)
- `darwin-x64/llama-server`        — macOS Intel

## How to build

```bash
./scripts/build-llama.sh
```

Or download pre-built from: https://github.com/ggerganov/llama.cpp/releases
(look for `llama-b*-bin-*.zip` for your platform)
