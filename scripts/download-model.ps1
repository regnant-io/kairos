# scripts/download-model.ps1
# Downloads recommended GGUF models for Kairos on Windows
#
# Usage (in PowerShell as Administrator):
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\scripts\download-model.ps1 -ModelId llama32-3b

param(
  [string]$ModelId = "llama32-3b"
)

$ModelsDir = Join-Path $PSScriptRoot ".." "models"
New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null

$Models = @{
  "llama32-3b" = @{
    Url      = "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf"
    Filename = "llama-3.2-3b-instruct-q4_k_m.gguf"
    SizeNote = "~2.2 GB - recommended for 4+ GB RAM"
  }
  "llama31-8b" = @{
    Url      = "https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"
    Filename = "llama-3.1-8b-instruct-q4_k_m.gguf"
    SizeNote = "~4.7 GB - better quality, needs 8+ GB RAM"
  }
  "phi35-mini" = @{
    Url      = "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf"
    Filename = "phi-3.5-mini-instruct-q4.gguf"
    SizeNote = "~2.2 GB - fast, needs 4+ GB RAM"
  }
}

if (-not $Models.ContainsKey($ModelId)) {
  Write-Error "Unknown model: $ModelId. Available: $($Models.Keys -join ', ')"
  exit 1
}

$model = $Models[$ModelId]
$dest  = Join-Path $ModelsDir $model.Filename

if (Test-Path $dest) {
  Write-Host "✓ $($model.Filename) already exists" -ForegroundColor Green
  exit 0
}

Write-Host "[*] Downloading $($model.Filename) ($($model.SizeNote))" -ForegroundColor Cyan
Write-Host "[*] This may take several minutes..."

try {
  $ProgressPreference = 'SilentlyContinue'  # Speeds up downloads significantly
  Invoke-WebRequest -Uri $model.Url -OutFile $dest -UseBasicParsing
  Write-Host "✅ Downloaded: $dest" -ForegroundColor Green
  Write-Host ""
  Write-Host "Run 'npm run dev' to start Kairos." -ForegroundColor Yellow
} catch {
  Write-Error "Download failed: $_"
  if (Test-Path $dest) { Remove-Item $dest }
  exit 1
}
