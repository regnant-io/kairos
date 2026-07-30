#!/usr/bin/env bash
# scripts/build-llama.sh
# Builds llama-server for the current platform and places it in binaries/
#
# Usage:
#   chmod +x scripts/build-llama.sh
#   ./scripts/build-llama.sh
#
# Requirements:
#   macOS:  brew install cmake git
#   Linux:  apt-get install cmake git build-essential
#   Windows: Run in Git Bash with Visual Studio build tools installed

set -euo pipefail

LLAMA_VERSION="b3962"   # llama.cpp release tag
REPO_URL="https://github.com/ggerganov/llama.cpp.git"
BUILD_DIR="/tmp/llama-build"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Detect platform
PLATFORM="$(uname -s)"
ARCH="$(uname -m)"

case "$PLATFORM" in
  Darwin)
    TARGET_DIR="$PROJECT_ROOT/binaries/darwin-$ARCH"
    CMAKE_EXTRA="-DLLAMA_METAL=ON"   # Metal GPU acceleration on Apple Silicon
    ;;
  Linux)
    TARGET_DIR="$PROJECT_ROOT/binaries/linux-x64"
    CMAKE_EXTRA=""
    # Detect NVIDIA GPU
    if command -v nvidia-smi &>/dev/null; then
      echo "[*] NVIDIA GPU detected — enabling CUDA"
      CMAKE_EXTRA="-DLLAMA_CUDA=ON"
    fi
    ;;
  MINGW*|CYGWIN*|MSYS*)
    TARGET_DIR="$PROJECT_ROOT/binaries/win-x64"
    CMAKE_EXTRA=""
    ;;
  *)
    echo "Unsupported platform: $PLATFORM"
    exit 1
    ;;
esac

mkdir -p "$TARGET_DIR"
echo "[*] Building llama.cpp $LLAMA_VERSION for $PLATFORM/$ARCH"
echo "[*] Output: $TARGET_DIR"

# Clone or update
if [ -d "$BUILD_DIR" ]; then
  echo "[*] Updating existing clone..."
  cd "$BUILD_DIR"
  git fetch origin
  git checkout "$LLAMA_VERSION" 2>/dev/null || git checkout main
else
  echo "[*] Cloning llama.cpp..."
  git clone --depth 1 --branch "$LLAMA_VERSION" "$REPO_URL" "$BUILD_DIR" 2>/dev/null || \
    git clone --depth 1 "$REPO_URL" "$BUILD_DIR"
  cd "$BUILD_DIR"
fi

# Build
mkdir -p build && cd build
cmake .. \
  -DCMAKE_BUILD_TYPE=Release \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  $CMAKE_EXTRA

cmake --build . --config Release -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Copy binaries
echo "[*] Copying binaries to $TARGET_DIR..."

if [ "$PLATFORM" = "MINGW"* ] || [ "$PLATFORM" = "CYGWIN"* ] || [ "$PLATFORM" = "MSYS"* ]; then
  cp bin/Release/llama-server.exe "$TARGET_DIR/llama-server.exe" 2>/dev/null || \
  cp bin/llama-server.exe "$TARGET_DIR/llama-server.exe"
else
  cp bin/llama-server "$TARGET_DIR/llama-server" 2>/dev/null || \
  cp llama-server "$TARGET_DIR/llama-server" 2>/dev/null || \
  find . -name "llama-server" -not -path "*/CMakeFiles/*" -exec cp {} "$TARGET_DIR/llama-server" \;
  chmod +x "$TARGET_DIR/llama-server"
fi

echo ""
echo "✅ llama-server built successfully!"
echo "   Location: $TARGET_DIR/llama-server"
echo ""
echo "Next steps:"
echo "  1. Download a GGUF model into the 'models/' directory:"
echo "     Example: models/llama-3.2-3b-instruct-q4_k_m.gguf"
echo "     Download from: https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF"
echo ""
echo "  2. Run Kairos:"
echo "     npm run dev"
