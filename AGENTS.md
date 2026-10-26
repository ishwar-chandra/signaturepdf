# Repository Guidelines

## Project Overview

Signature PDF (`24eme/signaturepdf`, AGPL-3.0) is a free web application for **signing PDFs alone or with multiple people**, organizing pages (merge, reorder, rotate, delete, extract, booklet), editing metadata, OCR, and compressing PDFs.

- Six user-facing surfaces: Sign (`/signature`), Images (`/image-to-pdf`), Organize (`/organization`), Metadata (`/metadata`), Compress (`/compress`), Administration (`/administration`).
- No database, no user accounts, no migrations. State is either ephemeral temp files or files under `PDF_STORAGE_PATH`.
- Three operating modes:
  - **Ephemeral web**: upload → edit in browser → POST overlay layers → server stamps → download. The PDF is not retained after the response (temp files are cleaned unless `DEBUG`).
  - **Shared**: uploader creates a hash, gets an admin key and a signing URL. Recipients append SVG layers server-side; optional GPG encryption with a 15-character symmetric key carried in the URL fragment and a cookie.
  - **Local desktop** (`LOCAL_ONLY=true`): the Electron build bundles PHP, serves only `127.0.0.1`, and performs signing, image-to-PDF, and compression in the renderer. Sharing, server storage, OCR, and NSS signing are disabled.
- Deployed as a Docker image (`xgaia/signaturepdf`), a Debian package, a plain Apache/PHP host, or a Windows NSIS installer built from `desktop/`.

## Architecture & Data Flow

**Fat-Free Framework (F3) monolith, PHP + CLI tools, browser-heavy editing.**

### Request lifecycle

1. `public/index.php` → `require __DIR__.'/../app.php'` → `$f3->run()`.
2. `app.php` explicitly requires every `lib/*.class.php` (no Composer autoload at runtime), calls `Config::createInstance($f3)`, then declares **all routes** in one table.
3. Controller actions receive `Base $f3`. Pages are rendered with `View::instance()->render('name.html.php')`; files are streamed with `Web::instance()->send()`; API actions echo JSON.
4. `Config` is a singleton that starts the session, loads `config/config.ini`, sets locale/gettext, derives `ROOT`/`UI`/`UPLOADS`, computes admin access, and initializes NSS if configured.

**Core pattern:** thin controller action → helper class in `lib/` → external binary (`rsvg-convert`, `pdftk`, `gs`, `gpg`, `pdfsig`, `convert`, `potrace`). There is no service/repository layer, no DI container, and no ORM. F3's hive (`$f3->get()/set()`) is the shared state.

### Ephemeral signing flow (`POST /sign`, `POST /image2svg`)

1. `public/js/signature.js` renders pages with PDF.js and edits overlays with Fabric.js.
2. Each page canvas is serialized with `canvas.toSVG()` and submitted as `svg[]` alongside the PDF.
3. `MainController::sign` stores uploads via `Web::instance()->receive()` with MIME checks, then:
   - `PDFSignature::createPDFFromSvg()` → `rsvg-convert -f pdf`
   - `PDFSignature::addSvgToPDF()` → `pdftk … multistamp`
   - optional `pdfsig` certificate signature; optional ImageMagick flatten
4. Result is streamed as `<name>_signe.pdf`; temp files are removed unless `DEBUG` is set.

### Shared signing flow (`POST /share`, `/signature/@hash/*`)

- Storage layout under `PDF_STORAGE_PATH/<hash>/`:
  - `original.pdf`, `filename.txt`
  - `<timestamp>.svg.pdf` — one layer per signing round
  - `<timestamp>.sign.pdf` — cached stamped intermediate
  - `final.pdf` — compiled result
- Sibling files: `<hash>.expire` (mtime is expiry) and `<hash>.admin` (20-character deletion key); `.lock` serializes compilation. An unset/empty `PDF_STORAGE_PATH` disables sharing entirely (templates set `noSharingMode`).
- `PDFSignature::addSignature()` adds a new layer and recompiles. `getLayers()` globs `*.svg.pdf`; `compile()` folds them in order and caches `final.pdf`.
- With `PDF_STORAGE_ENCRYPTION=true`, every PDF plus `filename.txt` is GPG-encrypted to `*.gpg`; decrypted copies live briefly in the system temp dir. The symmetric key is never in the URL path: it is the fragment (`#<key>`) and a cookie named `<hash>`.
- `/signature/@hash/nblayers` lets the browser poll and reload when another signer saves; `/cron` deletes expired shares.
- `GPGCryptography::hardUnlink()` overwrites file contents before unlinking; use it for user data.

### Browser-only flows

- **Organize** (`public/js/organization.js`): PDF.js + pdf-lib; pages are rearranged/rotated/extracted in memory, then downloaded or PUT to WebDAV.
- **Metadata** (`public/js/metadata.js`): pdf-lib edits the info dictionary in memory; optional server-file mode uses `#local:<path>` with `GET /api/file/get` and `PUT /api/file/save`, optional WebDAV uses `#dav:<url>`.
- **Image to PDF** (`/image-to-pdf`, `public/js/image-to-pdf.js`): multiple PNG/JPEG files are normalized through a canvas (EXIF orientation, 4000 px cap) and embedded with pdf-lib. Page size (A4/Letter/same as image), orientation, margin, and ordering are client-side. Nothing is uploaded.
- **Compress**: preset compression posts to `/compress` and uses Ghostscript (`Compression::compress`). Target-size compression (`targetSize` in KB) iterates a quality/resolution ladder in `Compression::compressToTarget()`; response headers `X-Compression-Target-Met` and `X-Compressed-Size` report the outcome. If Ghostscript is absent (or `LOCAL_ONLY` is set and capabilities report no Ghostscript), `public/js/pdf-compressor.js` rasterizes pages with PDF.js and re-embeds JPEGs, searching for the target size in the browser. HTTP 204 means the result was not smaller.
- **OCR** (`POST /ocr`): server-side `ocrmypdf`; `OCR::isInstalled()` hardcodes `false`, so the compress/metadata OCR buttons stay hidden even though the homepage still links to `/ocr`.

### Local desktop flow (`desktop/`)

- `desktop/main.js` picks a free `127.0.0.1` port, regenerates a per-user `config.ini` with `LOCAL_ONLY=true`, and spawns the bundled `php.exe -S 127.0.0.1:<port> -t public`.
- `desktop/scripts/fetch-php.js` downloads PHP 8.3.36 NTS for Windows and verifies its SHA-256; `electron-builder` produces a per-user NSIS installer.
- In local mode, `signature.js` does not post overlays: `flattenPDFLocally()` loads the original PDF with pdf-lib and draws each Fabric overlay canvas as a full-page PNG (`overlayForPage()` compensates page rotation). Raster image imports bypass `/image2svg`.
- `LOCAL_ONLY` is enforced server-side: sharing routes/API return 403 and the share UI is hidden (`noSharingMode`). `Config` accepts `SIGNATUREPDF_CONFIG` so the desktop app can load a writable per-user config.

### URL fragment conventions (client-side state)

`#<symmetric-key>`, `#local:<path>`, `#dav:<url>`, `#http…`, `#cache:///pdf/<name>`. The fragment drives which loader `signature.js` / `organization.js` / `metadata.js` uses.

## Key Directories

| Path | Purpose |
|---|---|
| `lib/` | All backend PHP classes (`*.class.php`); controllers, PDF/crypto/compression helpers |
| `templates/` | F3 PHP views (`*.html.php`); `components/` holds header, footer, nav, upload, loading modal |
| `public/` | Webroot: `index.php`, hand-written JS (`js/`), CSS (`css/`), prebuilt vendor JS/CSS/fonts (`vendor/`) |
| `config/` | `config.ini.example` (documented options), `config.ini.tpl` (Docker envsubst), Apache vhost, PHP upload limits |
| `locale/` | gettext `.po` sources and generated `.pot`/`.mo` plus checksum-named symlinks |
| `tests/` | Single Jest + Puppeteer E2E spec and PDF/PNG fixtures |
| `desktop/` | Electron wrapper, pinned PHP runtime downloader, NSIS build config |
| `tools/` | `create_nss_certs.sh` for `pdfsig` certificates |
| `vendor/fatfree/` | Vendored Fat-Free framework; treat as third-party, do not refactor |
| `.debian/`, `.github/` | Debian packaging and the Docker publish workflow |

## Development Commands

```bash
# Dev server (public/ is the only webroot)
php -S localhost:8000 -t public

# Enable shared signing / encryption / local-file editing
cp config/config.ini.example config/config.ini
# then set PDF_STORAGE_PATH (writable by the web user)

# E2E tests
make test
DEBUG=1 make test                  # headed browser; skips test teardown

# One test by name
./node_modules/jest/bin/jest.js tests/signature.test.js -t "Upload et chargement du pdf"

# PHP syntax check (there is no PHP linter configured)
php -l lib/MainController.class.php

# Translations: extract strings, merge .po, rebuild .mo, refresh symlinks
make                               # default target == update_trad
make update_trad

# Docker
docker build -t signaturepdf .
docker run --rm -p 8080:80 -e PDF_STORAGE_PATH=/data signaturepdf

# Debian package (needs git tags + debuild/devscripts)
make deb

# Windows desktop installer (run on Windows; NSIS needs Windows/Wine)
cd desktop
npm ci
npm run dist
```

There is **no lint, formatter, typecheck, or frontend build step**. `.editorconfig` is the only enforced style contract: UTF-8, LF, 4 spaces (tabs in `Makefile`).

### Where to make common changes

- New route/page: add the route in `app.php`, an action in `lib/MainController.class.php`, a template in `templates/`, and a nav entry in `templates/components/navtab.html.php`.
- New PDF operation: add a helper in `lib/`, call it from a controller, and wire the UI in the relevant `public/js/*.js`.
- New external binary: add it to `Dockerfile`, `.debian/control`, `installation.md`, and the checks in `templates/admin_setup.html.php`.
- New config option: add it to `config/config.ini.example`; add to `config/config.ini.tpl` too if Docker should expose it.

## Code Conventions & Common Patterns

### PHP

- **PHP 7.2-compatible syntax** is the declared floor (`composer.json`); the Docker target is PHP 8.2. The code uses no namespaces, no `declare(strict_types=1)`, no typed properties, and no return types. Follow that style.
- File name == class name: `lib/PDFSignature.class.php` contains `class PDFSignature`. PascalCase classes, camelCase methods, `snake_case` F3 route aliases (`@signature_save`).
- Class braces go on the next line; method/control-flow braces on the same line. The codebase is not PSR-12; match surrounding code rather than reformatting.
- Controllers use `$f3->set(...)` for view variables and `echo View::instance()->render(...)`. Template variables are plain PHP variables (`$hash`, `$maxSize`, `$REVERSE_PROXY_URL`).
- Use `$f3->error(403)` / `$f3->error(404)` / `$f3->error(500, 'message')` for HTTP failures.
- Use `\Flash::instance()->setKey()` / `hasKey()` / `getKey()` for one-shot UI messages (modals); keys are cleared automatically.
- Read config through `$f3->get('KEY')`, never `$_ENV` directly. `Config::getInstance()` is the only singleton accessor pattern for app config.
- Dates and filenames: layers use `(new DateTime())->format('YmdHisu')`; temporary prefixes are `pdfsignature_<action>_`. Keep this convention so cleanup globs work.
- When adding temp files, guard cleanup with `if (!$f3->get('DEBUG'))` and unlink via `glob($tmpfile.'*')`.

### Shelling out

- Every argument passed to `shell_exec()`/`exec()` must go through `escapeshellarg()` (or `escapeshellcmd()` only when unavoidable). Existing helpers take arrays and `array_map('escapeshellarg', …)`.
- Helpers throw `Exception` on failure (`Compression`, `NSSCryptography`); controllers catch and map to HTTP 500 with a plain-text translated message. Non-critical failures (server certificate) are `error_log()`-ed and ignored so signing still succeeds.
- Check `file_exists()` on CLI outputs; `shell_exec()` returning a string is not a success signal.

### Uploads and security

- Never read `$_FILES` directly. Use `Web::instance()->receive($validate, $overwrite, $nameCallback)`:
  - validate with `Web::instance()->mime($file['tmp_name'], true)` and reject wrong types;
  - write to a `tempnam()`-derived path;
  - use `basename()` and `md5()` for generated names.
- Sanitize route hashes with `Web::instance()->slug()`.
- Path traversal checks exist in `Config::getApiLocalFilePath()`; preserve the `..` and `realpath()` checks when touching local-file APIs.
- Use `GPGCryptography::protectSymmetricKey()` before using a key from a request.
- There are **no CSRF tokens** and no authentication. Admin access is IP allowlisting (`ADMIN_AUTHORIZED_IP`, default localhost); shared links rely on unguessable hashes/keys. Do not log keys or admin tokens.

### Frontend

- Plain ES6+ JavaScript, no bundler, no framework. Files are loaded directly with `<script>` tags.
- `public/js/common.js` holds shared helpers (`showLoading`, `download`, `getCookieValue`, `imageToPdf`, WebDAV token bridge). Put cross-page helpers there.
- Large pages use module-level `let` state (`canvasEditions`, `pdfHash`, `pages`) and bottom-of-file `DOMContentLoaded` wiring. This is intentional; avoid introducing a second state paradigm or a build step.
- DOM IDs are `snake_case` (`input_pdf_upload`, `btn_modal_ajouter`); CSS classes are kebab-case; JS functions/globals are camelCase.
- Use Bootstrap 5 classes/components and Bootstrap Icons. Modals use `new bootstrap.Modal(...)` or `bootstrap.Modal.getOrCreateInstance(...)`. Loading state uses `startProcessingMode()` / `endProcessingMode()`.
- Theme: `data-bs-theme` is set before first paint by an inline script in `templates/components/header.html.php`; `common.js` toggles it and persists `signaturepdf-theme` in `localStorage`. Use Bootstrap color variables and the `.chip` / `.icon-*` helpers instead of hardcoded light-only colors.
- Prefer `$REVERSE_PROXY_URL` in templates and the injected `REVERSE_PROXY_URL` in JS for app URLs. Some legacy XHR calls still hardcode `/signature` or `/cron`; these break sub-path deployments, so fix them when touching that code.
- Asset cache busting uses `?<?php echo $COMMIT ? $COMMIT : filemtime($ROOT.'/public/js/common.js') ?>`; keep the pattern when adding assets.

### Internationalization

- Wrap new user-visible PHP strings in `_('…')`; use `sprintf(_('%s Signature'), …)` for markup interpolation. The application is originally French and many JS strings are still hardcoded French; only shared labels are injected via the `trad` object in `templates/components/common.html.php`.
- After adding/removing a translatable string, run `make` (or `make update_trad`). It rewrites `locale/application.pot`, all `.po` files, `.mo` files, and the checksum-named symlinks, and stages them with `git add`/`git rm`.
- Do **not** hand-edit `locale/application_*.pot`, `*.mo`, or symlinks. `Config` locates the gettext domain via `glob(ROOT.'/locale/application_*.pot')`, so a missing symlink breaks translations.
- Arabic drives RTL via `$DIRECTION_LANGUAGE` (set from the translated `"en"` string); test both LTR and RTL when changing layout.

### Known rough edges (do not silently “fix”)

- `OCR::isInstalled()` always returns `false`; `/ocr` remains routable while its UI entry points are hidden.
- `PDFSignature::isCompileLock()` compares `filemtime` to `time() + 30` (future) rather than `time() - 30`.
- The E2E spec is older than the current UI (see Testing & QA).

## Important Files

| File | Why it matters |
|---|---|
| `app.php` | Bootstrap and the complete route table |
| `public/index.php` | Web entry point (`$f3->run()`) |
| `lib/MainController.class.php` | Page rendering plus sign/share/save/compress/OCR handlers |
| `lib/ApiController.class.php` | JSON/file API: local file get/save and share create/get/delete |
| `lib/PDFSignature.class.php` | Layer creation, compile/cache, stamping, flatten, cleanup |
| `lib/GPGCryptography.class.php` | GPG encryption, decryption, key generation, secure deletion |
| `lib/NSSCryptography.class.php` | `pdfsig` server-certificate signing and verification |
| `lib/Compression.class.php` | Ghostscript compression profiles (`screen`/`ebook`/`printer`) |
| `lib/Config.class.php` | INI/env config, locale, admin IPs, API file path safety |
| `templates/signature.html.php` | Signature/shared-signing UI; injects `pdfHash`, `maxPage`, `sharingMode` |
| `public/js/signature.js` | Signature editor: PDF.js, Fabric.js, SVG layer upload, shared-sign polling |
| `public/js/organization.js` | Page organization and pdf-lib output |
| `public/js/metadata.js` | Metadata editing and document text/OCR tab |
| `public/js/compress.js` | Compression upload/target/result UI and server/local engine choice |
| `public/js/pdf-compressor.js` | Browser rasterizing compressor with target-size search |
| `public/js/image-to-pdf.js` | Client-side image normalization and PDF assembly |
| `templates/image-to-pdf.html.php` | Image-to-PDF page and options |
| `desktop/main.js` | Electron bootstrap, local PHP spawn, window hardening |
| `desktop/scripts/fetch-php.js` | Pinned, checksum-verified Windows PHP runtime download |
| `tests/signature.test.js` | Only automated test suite (Puppeteer E2E) |
| `Makefile` | `test`, translation regeneration, Debian packaging |
| `Dockerfile`, `entrypoint.sh` | Image build, envsubst templating, Apache startup |
| `config/config.ini.example` | Canonical configuration reference |

## Runtime/Tooling Preferences

- **Runtime**: PHP 8.2 in Docker (Apache + `mod_rewrite`); `composer.json` says `>=7.2`, the Debian package says `>=7.4`, and `installation.md` still says `>=5.6` — treat PHP 8.2 as the supported runtime and avoid syntax above 7.2 unless the floor is deliberately raised.
- **Composer**: `composer install` is optional and currently installs nothing; `vendor/fatfree/` is committed. Do not introduce Composer packages casually — deployment is copy-and-run with no build step.
- **Frontend**: no Node build. Third-party libraries are prebuilt under `public/vendor/`; the application JS/CSS is edited in place.
- **Required binaries**: `rsvg-convert`, `pdftk`, ImageMagick (`convert`, or `magick` for flatten), `potrace`, `gs`, `gpg`. Optional: `ocrmypdf` (OCR), `pdfsig` + `certutil` (server certificate signing).
- **Node**: the root test harness has no committed `package.json`/lockfile (`package.json`, `package-lock.json`, `node_modules` are gitignored); `make test` installs unpinned latest versions. `desktop/package.json` is committed and pins Electron/electron-builder. Build the installer on Windows with Node 20+; `npm run fetch:php` downloads the checksum-pinned PHP runtime.
- **Configuration**: `config/config.ini` (gitignored) is loaded at runtime. `DEBUG` is read from the environment and disables temp cleanup. Docker renders `config/config.ini.tpl`, `config/php.ini`, and `config/apache.conf` with `envsubst`; keep placeholders intact.
- **Docker env vars**: `SERVERNAME` (localhost), `UPLOAD_MAX_FILESIZE`/`POST_MAX_SIZE` (24M), `MAX_FILE_UPLOADS` (201), `PDF_STORAGE_PATH` (`/data`), `DISABLE_ORGANIZATION` (false), `PDF_DEMO_LINK` (true), `DEFAULT_LANGUAGE` (`fr_FR.UTF-8`), `PDF_STORAGE_ENCRYPTION` (false).
- **Persistence**: only `PDF_STORAGE_PATH`. The Dockerfile declares no `VOLUME`; mount it explicitly for shared signing. The desktop build writes `config.ini` and `php.log` under `%APPDATA%\Signature PDF\`, never into the install directory.
- **Desktop build**: `cd desktop && npm install && npm run fetch:php && npm run dist`; output `desktop/dist/SignaturePDF-Setup-<version>.exe` (NSIS, per-user, x64). The bundled PHP is 8.3.36 NTS; `fetch-php.js` also copies `vcruntime140.dll` from the Windows build host. See `desktop/README.md`.
- **Documentation**: English `README.md` is canonical; `README.fr.md` and `installation.md` are French. Update `installation.md` when dependencies or deployment steps change.

## Testing & QA

### Framework and layout

- **Jest + Puppeteer**, single spec: `tests/signature.test.js`. No PHP unit tests, no component tests, no coverage configuration or threshold. `vendor/fatfree/test.php` is the framework's own upstream test, not application coverage.
- Fixtures: `tests/files/document.pdf` (16 pages), `document_ar.pdf`, `signature.png`, `tampon.png`. Downloads go to `tests/downloads/` (gitignored).
- The spec starts its own server: `php -S localhost:<9000–9999> -t public`, then drives Chromium.
- Assertions use Jest `expect` and inspect browser state via `page.evaluate()`; test names are French sentences. There are no mocks, factories, or test helpers.

### Running

```bash
make test                                   # installs jest/puppeteer if missing, then runs
DEBUG=1 make test                           # headed; afterAll returns early (server/browser stay up)
./node_modules/jest/bin/jest.js tests/signature.test.js -t "Création d'une signature"
```

### Prerequisites and caveats

- Requires `php` on `PATH`, `rsvg-convert`, `pdftk`, ImageMagick (`convert`), `mkbitmap`, `potrace`, and a Puppeteer-downloaded Chromium. No database, Redis, or network service is needed for the ephemeral flow.
- `make test` installs **unpinned** latest Jest/Puppeteer. The spec uses legacy Puppeteer APIs (`page.waitForTimeout`, `page._client`); if startup fails, pin Puppeteer ≤ 21 or modernize the spec.
- The spec was last updated in 2022 and assumes the legacy homepage exposes `#input_pdf_upload`. The current `/` (`templates/index.html.php`) is a tool chooser with no upload input, so the first test will fail until the spec navigates to `/signature` (or the test is updated). Treat a green run as meaningful only after that assumption is fixed.
- CI (`.github/workflows/docker.yaml`) only builds/pushes the Docker image. **No test or lint job runs on pull requests.**
- `DEBUG=1` skips teardown intentionally for inspection; kill the spawned `php -S` and Chromium manually afterward.

### Manual verification

For UI or PDF changes, start `php -S localhost:8000 -t public`, open `/signature`, upload `tests/files/document.pdf`, create a signature, place it, and download. Also exercise `/image-to-pdf` with several PNG/JPEGs and `/compress` with and without a KB target. Test local-only behavior with `SIGNATUREPDF_CONFIG` pointing at a config containing `LOCAL_ONLY=true`; confirm `/signature` hides sharing and `/api/share/new` returns 403. For backend-only changes, `php -l` plus a route-level smoke test with `curl` is the minimum.

The desktop wrapper itself can be smoke-tested with `SIGNATUREPDF_URL=http://localhost:8000 npm start` on a machine with Electron; the Windows installer path requires a Windows build host.
