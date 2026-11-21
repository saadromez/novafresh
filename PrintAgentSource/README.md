# Lanka Print Agent

A Windows system-tray app that receives print jobs from the Lanka Salon Hub web app
and sends them directly to a thermal printer via ESC/POS (no browser print dialog).

---

## Requirements
- Windows 10/11
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) (to build)
- Your thermal printer driver installed in Windows

---

## Build (one-time)

```bash
cd PrintAgent/LankaPrintAgent
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true
```

Output: `bin/Release/net8.0-windows/win-x64/publish/LankaPrintAgent.exe`

---

## Install on POS PC

1. Copy `LankaPrintAgent.exe` anywhere (e.g. `C:\Program Files\LankaPrintAgent\`)
2. Double-click to run — it appears in the **system tray** (bottom-right)
3. Right-click tray icon → **Select Printer** → choose your thermal printer → **Save**
4. Click **Test Print** to verify
5. The app auto-registers itself to start with Windows

---

## How it works

```
Web App (browser)
    │
    │  POST http://localhost:7777/print  (JSON receipt data)
    ▼
LankaPrintAgent.exe  (system tray, always running)
    │
    │  Raw ESC/POS bytes via Windows spooler
    ▼
Thermal Printer (USB / network)
```

- When the print agent is running, the **Print Receipt** button in the web app shows a green ⚡ indicator
- It sends ESC/POS bytes directly — instant print, no dialog
- If the agent is not running, it falls back to the normal browser print dialog

---

## API Endpoints (localhost:7777)

| Method | Path        | Description                        |
|--------|-------------|------------------------------------|
| GET    | /ping       | Health check                       |
| GET    | /printers   | List installed printers            |
| POST   | /print      | Print a receipt (JSON body)        |
| POST   | /settings   | Update printer/paper settings      |

---

## Paper Width
- **80mm** — standard thermal roll (default)
- **58mm** — narrow thermal roll

Change via tray icon → Select Printer → choose width → Save.
