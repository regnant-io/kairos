# Troubleshooting Guide

## Common Issues and Solutions

### 1. Exam Generation Fails with Truncated JSON

**Symptoms:**
- Error: "Failed to parse AI JSON: SyntaxError: Expected ',' or ']' after array element"
- Error shows truncated JSON output
- Exam generation stops mid-way

**Causes:**
- Model output is being cut off before completion
- Token limit reached
- Model context size too small

**Solutions:**

#### A. Reduce Exam Complexity
1. Generate fewer questions (e.g., 10 instead of 20)
2. Use simpler question types (fewer MCQs with options)
3. Split large exams into multiple smaller ones

#### B. Increase Token Limits (Already Applied)
The following have been increased:
- `maxTokens` in exam generation: 10,000 tokens
- `--n-predict` in llama server: 12,000 tokens
- Context size: 4096 (16GB+ RAM) or 2048 (lower RAM)

#### C. Use a Larger Model
If using llama.cpp:
- Switch to a model with larger context window
- Use Q4 or Q5 quantization for better quality

If using Ollama:
- Try models with larger context: `ollama pull qwen2.5:14b`
- Use models optimized for long outputs

#### D. Check Server Logs
Look for these indicators:
- "context size exceeded"
- "token limit reached"
- Memory allocation errors

### 2. Ollama Connection Timeout

**Symptoms:**
- Error: "TypeError: fetch failed"
- Error: "Connect Timeout Error" (UND_ERR_CONNECT_TIMEOUT)
- "Cannot connect to Ollama at http://localhost:11434"

**Solutions:**

#### A. Verify Ollama is Running
```bash
# Check if Ollama is running
ollama list

# If not running, start it
ollama serve
```

#### B. Check Endpoint Configuration
1. Go to Settings → AI Model → Ollama Settings
2. Verify endpoint is correct (default: `http://localhost:11434`)
3. If Ollama is on a different port, update the endpoint

#### C. Test Ollama Connection
```bash
# Test if Ollama is accessible
curl http://localhost:11434/api/tags

# Should return list of installed models
```

#### D. Firewall/Network Issues
- Check if firewall is blocking port 11434
- If using WSL, ensure port forwarding is configured
- Try using `http://127.0.0.1:11434` instead of `localhost`

### 3. Theme Not Switching

**Symptoms:**
- Theme toggle doesn't change appearance
- Colors don't update
- Theme resets on restart

**Solutions:**

#### A. Clear Browser Cache
1. Close the app completely
2. Delete: `%APPDATA%\kairos\` (Windows) or `~/.config/kairos/` (Linux/Mac)
3. Restart the app

#### B. Check Theme Persistence
- Theme is stored in localStorage
- Check browser console for errors
- Verify CSS variables are being applied

#### C. System Theme Detection
- App now defaults to system theme on first launch
- Manual theme selection overrides system preference
- Theme changes are detected automatically

### 4. Thinking Models Not Working

**Symptoms:**
- Thinking model toggle keeps disabling
- Thinking model not being used
- No thinking output in responses

**Solutions:**

#### A. Verify Model is Installed (Ollama)
```bash
# Install a thinking model
ollama pull deepseek-r1:8b

# Verify it's installed
ollama list
```

#### B. Enable Thinking Models
1. Go to Settings → AI Model → Ollama Settings
2. Check "Enable thinking models for complex reasoning"
3. Enter model name: `deepseek-r1:8b`
4. Settings should persist after saving

#### C. Check Model Output Format
- Thinking models should output `<think>...</think>` tags
- If not seeing thinking output, model may not support it
- Try a different thinking model

### 5. GPU Not Being Used

**Symptoms:**
- Slow inference despite having GPU
- GPU layers set to 0
- No GPU detected

**Solutions:**

#### A. Verify GPU Detection
1. Go to Settings → System → GPU Acceleration
2. Check if GPU is detected
3. If not detected, ensure NVIDIA drivers are installed

#### B. Set GPU Layers Manually
1. Go to Settings → System → GPU Acceleration
2. Set layers based on your VRAM:
   - 4GB VRAM: 15-20 layers
   - 6GB VRAM: 25-28 layers
   - 8GB+ VRAM: 33 layers (full offload)
3. Click "Restart AI" to apply

#### C. Check CUDA/Vulkan Support
- Ensure llama.cpp binaries support GPU
- Check for `ggml-vulkan.dll` or CUDA libraries in binaries folder
- Rebuild llama.cpp with GPU support if needed

### 6. AI Generation is Slow

**Symptoms:**
- Takes minutes to generate content
- CPU usage at 100%
- Unresponsive UI during generation

**Solutions:**

#### A. Enable GPU Acceleration
See "GPU Not Being Used" section above

#### B. Use Ollama Instead of llama.cpp
1. Install Ollama: https://ollama.ai
2. Pull a model: `ollama pull llama3.2:3b`
3. In Settings → AI Model, select "Ollama"
4. Set endpoint and model name
5. Restart AI

#### C. Use Smaller/Faster Models
- llama3.2:1b (fastest, lower quality)
- llama3.2:3b (balanced)
- qwen2.5:7b (better quality, slower)

#### D. Reduce Thread Count
- Go to Settings → System
- Reduce thread count if system is overloaded
- Leave 1-2 cores free for UI

### 7. JSON Parsing Errors

**Symptoms:**
- "Failed to parse AI JSON"
- "No JSON found in AI response"
- Incomplete or malformed output

**Solutions:**

#### A. Improved JSON Repair (Already Applied)
The app now has three levels of JSON repair:
1. Standard repair (trailing commas, unclosed strings)
2. Advanced repair (incomplete key-values, arrays)
3. Aggressive repair (line-by-line validation)

#### B. Adjust Temperature
Lower temperature = more consistent JSON:
- Exam generation: 0.25 (already set)
- Lesson plans: 0.3 (already set)
- Reports: 0.4 (already set)

#### C. Use Better Models
Some models are better at JSON:
- qwen2.5 series (excellent JSON)
- llama3.2 series (good JSON)
- mistral series (good JSON)

### 8. Settings Not Persisting

**Symptoms:**
- Settings reset after restart
- Changes don't save
- Error when saving settings

**Solutions:**

#### A. Check Database Permissions
- Ensure app has write access to user data folder
- Check if database file is locked by another process

#### B. Verify Settings Handler
- Check browser console for errors
- Settings should return updated values after save
- Local state should update immediately

#### C. Clear and Reinitialize
1. Export your data first (if any)
2. Close app
3. Delete database: `%APPDATA%\kairos\kairos.db`
4. Restart app and reconfigure

## Getting Help

If issues persist:

1. **Check Logs:**
   - Main process logs in terminal/console
   - Renderer logs in DevTools (Ctrl+Shift+I)

2. **Collect Information:**
   - OS and version
   - RAM and GPU specs
   - Model being used
   - Error messages (full stack trace)

3. **Report Issue:**
   - Include logs and error messages
   - Describe steps to reproduce
   - Mention what you've already tried

## Performance Tips

### For Best Performance:

1. **Use GPU acceleration** if available (33 layers for 8GB+ VRAM)
2. **Use Ollama** instead of llama.cpp for easier setup
3. **Choose appropriate model size:**
   - 3B models: Fast, good for most tasks
   - 7B models: Better quality, slower
   - 14B+ models: Best quality, requires good hardware

4. **Optimize settings:**
   - Enable GPU layers
   - Use moderate context size (4096)
   - Keep thread count reasonable (CPU cores - 2)

5. **Reduce complexity:**
   - Generate fewer questions per exam
   - Use simpler question types
   - Split large tasks into smaller ones
