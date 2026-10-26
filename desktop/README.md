# Signature PDF Desktop (Windows)

Local-only Windows build of Signature PDF. Everything runs on the user's
machine: a bundled PHP server listens on `127.0.0.1` and serves the templates,
while signing, image-to-PDF conversion and compression are performed in the
Electron renderer. No PDF is uploaded to a remote server and sharing is
disabled.

## Build

Requirements:

- Windows 10/11 x64 (recommended build host)
- Node.js 20+ and npm
- Optional: Ghostscript for faster, text-preserving compression

```powershell
cd desktop
npm install
npm run fetch:php     # downloads pinned PHP 8.3.36 NTS and verifies SHA-256
npm run dist          # builds dist/SignaturePDF-Setup-1.0.0.exe
npm run pack          # unpacks a portable build under dist/win-unpacked/
```

The installer is per-user (no administrator rights required) and creates
desktop and Start Menu shortcuts. Output:

```text
desktop/dist/SignaturePDF-Setup-<version>.exe
```

For development on any OS with `php` on `PATH`:

```bash
cd desktop
npm install
npm start
```

Set `SIGNATUREPDF_URL=http://localhost:8000` to attach the Electron window to
an already-running development server instead of spawning PHP.

## What is local

- **Signing**: the original PDF and overlay layers are flattened with pdf-lib
  inside the renderer. `pdftk`, `rsvg-convert`, ImageMagick and potrace are not
  required.
- **Image to PDF**: pdf-lib, fully in the renderer.
- **Compression**:
  - If Ghostscript is available (`gs` on `PATH`, `GHOSTSCRIPT_PATH`, or a
    standard `C:\Program Files\gs\...` install), the local PHP process uses it.
  - Otherwise the browser renderer re-encodes pages as JPEG and searches for
    the requested target size. This removes selectable text but needs no
    external binary.
- **Organize / metadata**: already client-side in the web application.
- **Sharing, server storage, OCR, and server-certificate signing** are disabled
  in the desktop build. `LOCAL_ONLY=true` is written to the per-user config on
  every start, and the sharing endpoints return HTTP 403.

The desktop build writes only:

- configuration and PHP logs: `%APPDATA%\Signature PDF\`
- browser cache: Electron's per-user data directory
- temporary uploads: the OS temp directory

It never writes into the installation directory.

## Configuration

`desktop/main.js` regenerates `config.ini` in `%APPDATA%\Signature PDF\` on
startup:

```ini
[globals]
LOCAL_ONLY=true
PDF_STORAGE_PATH=
PDF_DEMO_LINK=
PDF_STORAGE_ENCRYPTION=false
DISABLE_ORGANIZATION=false
ADMIN_AUTHORIZED_IP=127.0.0.1 ::1
```

The PHP runtime is started with:

```text
php.exe -c php.ini -d extension_dir=...\ext -S 127.0.0.1:<random port> -t public
```

The PHP Windows archive is pinned in `scripts/fetch-php.js` and checked against
its SHA-256 before extraction. The script also copies `vcruntime140.dll` from
the Windows build machine; if that DLL is unavailable, install the Microsoft
Visual C++ 2015-2022 Redistributable (x64) on the target machine. `runtime/` is
generated and ignored by Git.

## Windows installer details

- Electron Builder targets NSIS, x64, per-user install.
- File name: `SignaturePDF-Setup-<version>.exe`.
- Application id: `fr.signaturepdf.desktop`.
- Icon: `desktop/build/icon.ico`.
- The app is unsigned by default. Windows SmartScreen may warn on first launch.
  To sign, set `CSC_LINK` and `CSC_KEY_PASSWORD` before `npm run dist`.
- Auto-update is not configured.

## Known limitations

- PDFs protected by a password may fail when opened in the browser.
- Browser compression rasterizes pages; use Ghostscript for text-preserving
  compression.
- OCR, shared-signature links, GPG-encrypted server storage, and `pdfsig`
  certificate signatures are unavailable.
- Building the NSIS installer on Linux/macOS requires Wine; build on Windows for
  the supported path.
