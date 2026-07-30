#!/usr/bin/env bash
# scripts/download-model.sh
# Downloads recommended GGUF models for Kairos
#
# Usage:
#   ./scripts/download-model.sh [model_id]
#
# Available models:
#   llama32-3b   (default, 2.2 GB, recommended for 4+ GB RAM)
#   llama31-8b   (4.7 GB, better quality, needs 8+ GB RAM)
#   phi35-mini   (2.2 GB, fast, needs 4+ GB RAM)

set -euo pipefail

MODEL_ID="${1:-llama32-3b}"
MODELS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/models"

mkdir -p "$MODELS_DIR"

download_model() {
  local url="$1"
  local filename="$2"
  local dest="$MODELS_DIR/$filename"

  if [ -f "$dest" ]; then
    echo "✓ $filename already exists, skipping download"
    return
  fi

  echo "[*] Downloading $filename..."
  echo "[*] Destination: $dest"
  echo "[*] This may take several minutes depending on your connection..."

  if command -v wget &>/dev/null; then
    wget -c --show-progress -O "$dest" "$url"
  elif command -v curl &>/dev/null; then
    curl -L --progress-bar -C - -o "$dest" "$url"
  else
    echo "Error: wget or curl required"
    exit 1
  fi

  echo "✓ Downloaded: $dest"
}

case "$MODEL_ID" in
  llama32-3b)
    echo "[*] Downloading Llama 3.2 3B Instruct Q4_K_M (recommended, ~2.2 GB)"
    download_model \
      "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf" \
      "llama-3.2-3b-instruct-q4_k_m.gguf"
    ;;
  llama31-8b)
    echo "[*] Downloading Llama 3.1 8B Instruct Q4_K_M (high quality, ~4.7 GB)"
    download_model \
      "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf" \
      "llama-3.1-8b-instruct-q4_k_m.gguf"
    ;;
  phi35-mini)
    echo "[*] Downloading Phi-3.5 Mini Instruct Q4 (low RAM, ~2.2 GB)"
    download_model \
      "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf" \
      "phi-3.5-mini-instruct-q4.gguf"
    ;;
  *)
    echo "Unknown model: $MODEL_ID"
    echo "Available: llama32-3b, llama31-8b, phi35-mini"
    exit 1
    ;;
esac

echo ""
echo "✅ Model ready! Run 'npm run dev' to start Kairos."
echo "   Models directory: $MODELS_DIR"
ls -lh "$MODELS_DIR"/*.gguf 2>/dev/null || true
