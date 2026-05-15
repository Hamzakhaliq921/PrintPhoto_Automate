# PhotoPrint Pro 📸

https://github.com/user-attachments/assets/d4dabe0c-f7f3-4f4b-9f27-22f4e785be2f


Automated passport & ID photo layout generator with **free, offline AI background removal** powered by [rembg](https://github.com/danielgatis/rembg).

---

## Project Structure

```
photoprint/
├── backend/
│   ├── server.py          ← Flask API server (rembg)
│   └── requirements.txt   ← Python dependencies
├── frontend/
│   └── index.html         ← Full UI (open in browser)
├── start.bat              ← Windows launcher
├── start.sh               ← Mac/Linux launcher
└── README.md
```

---

## Quick Start

### Windows
```
Double-click start.bat
```

### Mac / Linux
```bash
chmod +x start.sh
./start.sh
```

Then open `frontend/index.html` in your browser.

---

## Manual Setup

### Step 1 — Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

> **First run:** rembg will automatically download the u2net AI model (~170 MB). This happens once and is cached locally.

### Step 2 — Start the server

```bash
python server.py
```

You should see:
```
Loading rembg AI model (u2net)... this takes ~10s on first run
Model loaded. Server ready.
Starting PhotoPrint rembg server on port 5000
```

### Step 3 — Open the frontend

Open `frontend/index.html` in your browser (Chrome or Firefox recommended).

The green "Server online" indicator in the top-right confirms the connection.

---

## API Endpoints

| Method | Endpoint         | Description                    |
|--------|------------------|-------------------------------- |
| GET    | /health          | Check server status             |
| POST   | /remove-bg       | Remove background (single image)|
| POST   | /remove-bg/batch | Remove backgrounds (batch)      |

### POST /remove-bg — JSON body
```json
{
  "image_base64": "data:image/jpeg;base64,/9j/..."
}
```

### POST /remove-bg — Form upload
```
Content-Type: multipart/form-data
Field: image (file)
```

### Response
```json
{
  "success": true,
  "image_base64": "data:image/png;base64,...",
  "processing_time_s": 1.23,
  "output_format": "PNG with transparency"
}
```

---

## Features

- ✅ AI background removal — free, local, no API key
- ✅ 6 photo size presets (Passport, 1×1, 2×2, ID Card, Visa, Custom)
- ✅ 4 layout options (2, 4, 6, 8 photos per page)
- ✅ Multiple page PDF output (300 DPI print quality)
- ✅ Crop guide marks, white border option
- ✅ Custom background colors
- ✅ Drag & drop upload
- ✅ Live preview before export
- ✅ Zero data sent to the internet

---

## Upgrading the AI Model

rembg supports multiple models. Edit `server.py` to switch:

| Model        | Quality | Speed | Use case                  |
|-------------|---------|-------|---------------------------|
| `u2net`      | Good    | Fast  | Default — general photos  |
| `u2net_human_seg` | Better  | Same  | Human portraits only  |
| `isnet-general-use` | Best | Slower | Fine details, hair |

```python
# In server.py, change:
SESSION = new_session("u2net_human_seg")
```

---

## Troubleshooting

**"Server offline" in UI**
→ Run `python server.py` first, then refresh the page.

**CORS error in browser console**
→ Open `index.html` via `file://` or a local server (`python -m http.server 8080`).

**pip install fails**
→ Try `pip install rembg[cpu]` — avoids GPU/CUDA dependencies.

**Slow processing**
→ Normal on first run (model loads). Subsequent images: ~1–3s each on CPU.

---

## Adding to a Node.js Backend

If you have a Node.js/Express backend, call the Python service as a microservice:

```javascript
const FormData = require('form-data');
const fetch = require('node-fetch');
const fs = require('fs');

async function removeBackground(imageBuffer) {
  const form = new FormData();
  form.append('image', imageBuffer, { filename: 'photo.jpg' });

  const resp = await fetch('http://localhost:5000/remove-bg', {
    method: 'POST',
    body: form
  });
  const data = await resp.json();
  if (!data.success) throw new Error(data.error);
  return data.image_base64; // transparent PNG as base64
}
```
