const { app, BrowserWindow, dialog, shell, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
const appName = 'Signature PDF';
let mainWindow = null;
let phpProcess = null;
let phpPort = null;
let quitting = false;

app.setName(appName);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        }
    });

    app.whenReady().then(bootstrap).catch(showFatalError);
}

function projectRoot() {
    return isDev ? path.resolve(__dirname, '..') : path.join(process.resourcesPath, 'app');
}

function userDataPath(file) {
    return path.join(app.getPath('userData'), file);
}

function phpBinary() {
    if (isDev) {
        const local = path.join(__dirname, 'runtime', 'php', process.platform === 'win32' ? 'php.exe' : 'php');
        return fs.existsSync(local) ? local : 'php';
    }
    return path.join(process.resourcesPath, 'php', process.platform === 'win32' ? 'php.exe' : 'php');
}

function phpIniPath() {
    const packaged = path.join(process.resourcesPath, 'php', 'php.ini');
    if (!isDev && fs.existsSync(packaged)) {
        return packaged;
    }
    if (process.platform === 'win32') {
        const local = path.join(__dirname, 'runtime', 'php', 'php.ini');
        return fs.existsSync(local) ? local : null;
    }
    return null;
}

function writeLocalConfig() {
    const configPath = userDataPath('config.ini');
    fs.mkdirSync(path.dirname(configPath), {recursive: true});

    // This file is regenerated on every start: the desktop build is always
    // local-only and must never offer shared/server-side PDF storage.
    const lines = [
        '[globals]',
        'LOCAL_ONLY=true',
        'PDF_STORAGE_PATH=',
        'PDF_DEMO_LINK=',
        'PDF_STORAGE_ENCRYPTION=false',
        'DISABLE_ORGANIZATION=false',
        'ADMIN_AUTHORIZED_IP=127.0.0.1 ::1'
    ];
    fs.writeFileSync(configPath, lines.join('\n') + '\n');

    return configPath;
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

function waitForServer(port, timeoutMs) {
    const started = Date.now();

    return new Promise((resolve, reject) => {
        const retry = () => {
            if (Date.now() - started > timeoutMs) {
                reject(new Error('The local PHP server did not start in time.'));
                return;
            }
            setTimeout(attempt, 250);
        };

        const attempt = () => {
            const request = http.get({
                host: '127.0.0.1',
                port: port,
                path: '/',
                timeout: 1500
            }, (response) => {
                response.resume();
                if (response.statusCode && response.statusCode < 500) {
                    resolve();
                } else {
                    retry();
                }
            });
            request.on('timeout', () => request.destroy());
            request.on('error', retry);
        };

        attempt();
    });
}

function appendLog(file, chunk) {
    try {
        fs.appendFileSync(file, chunk);
    } catch (error) {
        // Logging must never prevent the app from starting.
    }
}

function startPhp(port, configPath) {
    const binary = phpBinary();
    if (!fs.existsSync(binary) && path.isAbsolute(binary)) {
        throw new Error('The bundled PHP runtime is missing: ' + binary);
    }

    const args = [];
    const ini = phpIniPath();
    if (ini) {
        args.push('-c', ini);
        args.push('-d', 'extension_dir=' + path.join(path.dirname(ini), 'ext'));
    }

    args.push(
        '-d', 'max_execution_time=0',
        '-d', 'memory_limit=512M',
        '-d', 'upload_max_filesize=512M',
        '-d', 'post_max_size=512M',
        '-d', 'max_file_uploads=501',
        '-d', 'date.timezone=UTC',
        '-S', '127.0.0.1:' + port,
        '-t', 'public'
    );

    const env = Object.assign({}, process.env, {
        SIGNATUREPDF_CONFIG: configPath,
        DEBUG: ''
    });

    const bundledGhostscript = path.join(process.resourcesPath, 'ghostscript', 'bin', 'gswin64c.exe');
    if (!isDev && fs.existsSync(bundledGhostscript)) {
        env.GHOSTSCRIPT_PATH = bundledGhostscript;
    }

    const logFile = userDataPath('php.log');
    fs.writeFileSync(logFile, '');

    phpProcess = spawn(binary, args, {
        cwd: projectRoot(),
        env: env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    phpProcess.stdout.on('data', (data) => {
        appendLog(logFile, data);
        if (isDev) {
            process.stdout.write(data);
        }
    });
    phpProcess.stderr.on('data', (data) => {
        appendLog(logFile, data);
        if (isDev) {
            process.stderr.write(data);
        }
    });
    phpProcess.on('error', (error) => {
        showFatalError(new Error('Unable to start PHP: ' + error.message));
    });
    phpProcess.on('exit', (code) => {
        phpProcess = null;
        if (!quitting && code !== 0) {
            const hint = code === 3221225781 ?
                ' The Microsoft Visual C++ 2015-2022 Redistributable (x64) may be missing.' : '';
            showFatalError(new Error('The local PHP server stopped (exit code ' + code + ').' + hint + ' See ' + logFile));
        }
    });

    return phpProcess;
}

function createWindow(url) {
    Menu.setApplicationMenu(null);

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 900,
        minHeight: 620,
        show: false,
        backgroundColor: '#f8f9fa',
        icon: path.join(projectRoot(), 'public', 'favicon.ico'),
        title: appName,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            devTools: isDev,
            spellcheck: false
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    mainWindow.webContents.setWindowOpenHandler(({url}) => {
        if (/^https?:/i.test(url)) {
            shell.openExternal(url);
        }
        return {action: 'deny'};
    });

    mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
        if (!targetUrl.startsWith(url)) {
            event.preventDefault();
            if (/^https?:/i.test(targetUrl)) {
                shell.openExternal(targetUrl);
            }
        }
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame && errorCode !== -3 && !quitting) {
            dialog.showErrorBox(appName, 'Unable to load the application: ' + errorDescription + ' (' + errorCode + ')');
        }
    });

    mainWindow.loadURL(url);
}

async function bootstrap() {
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(false));

    if (process.env.SIGNATUREPDF_URL) {
        createWindow(process.env.SIGNATUREPDF_URL);
        return;
    }

    const configPath = writeLocalConfig();
    phpPort = await freePort();
    startPhp(phpPort, configPath);
    await waitForServer(phpPort, 25000);
    createWindow('http://127.0.0.1:' + phpPort + '/');
}

function stopPhp() {
    if (!phpProcess) {
        return;
    }
    try {
        phpProcess.kill();
    } catch (error) {
        // Already stopped.
    }
    phpProcess = null;
}

function showFatalError(error) {
    const message = error && error.message ? error.message : String(error);
    if (app.isReady()) {
        dialog.showErrorBox(appName, message);
    } else {
        console.error(message);
    }
    quitting = true;
    stopPhp();
    app.quit();
}

app.on('before-quit', () => {
    quitting = true;
    stopPhp();
});

app.on('window-all-closed', () => {
    app.quit();
});
