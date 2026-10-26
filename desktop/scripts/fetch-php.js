#!/usr/bin/env node
/**
 * Downloads the pinned Windows PHP runtime used by the installer.
 * Run this on Windows (or on a build machine when cross-packaging):
 *
 *   npm run fetch:php
 */
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { execFileSync } = require('child_process');

const PHP_VERSION = '8.3.36';
const PHP_URL = 'https://downloads.php.net/~windows/releases/php-' +
    PHP_VERSION + '-nts-Win32-vs16-x64.zip';
const PHP_SHA256 = '3c9242622c7402b47c38d2ec2ed779cef3a290fd6f2bde6c35f9c482699e7900';

const desktopRoot = path.resolve(__dirname, '..');
const runtimeRoot = path.join(desktopRoot, 'runtime');
const targetDir = path.join(runtimeRoot, 'php');
const archive = path.join(runtimeRoot, 'php.zip');

function download(url, destination, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) {
            reject(new Error('Too many redirects while downloading PHP'));
            return;
        }

        const request = https.get(url, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                response.resume();
                download(response.headers.location, destination, redirects + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error('Unable to download PHP: HTTP ' + response.statusCode));
                return;
            }

            const total = parseInt(response.headers['content-length'] || '0', 10);
            let received = 0;
            let lastPercent = -1;

            response.on('data', (chunk) => {
                received += chunk.length;
                if (total) {
                    const percent = Math.floor((received / total) * 100);
                    if (percent >= lastPercent + 10) {
                        lastPercent = percent;
                        process.stdout.write('  ' + percent + '%\n');
                    }
                }
            });

            const file = fs.createWriteStream(destination);
            response.pipe(file);
            response.on('error', reject);
            file.on('finish', () => file.close(resolve));
            file.on('error', reject);
        });
        request.setTimeout(120000, () => request.destroy(new Error('PHP download timed out')));
        request.on('error', reject);
    });
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copyVCRuntime(destination) {
    if (process.platform !== 'win32') {
        return;
    }
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const source = path.join(systemRoot, 'System32', 'vcruntime140.dll');
    if (fs.existsSync(source)) {
        fs.copyFileSync(source, path.join(destination, 'vcruntime140.dll'));
    } else {
        console.warn('Warning: vcruntime140.dll was not found; the target machine may need the Visual C++ Redistributable.');
    }
}

function extract(zipFile, destination) {
    if (process.platform === 'win32') {
        const command = "Expand-Archive -LiteralPath '" +
            zipFile.replace(/'/g, "''") + "' -DestinationPath '" +
            destination.replace(/'/g, "''") + "' -Force";
        execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
            stdio: 'inherit'
        });
        return;
    }
    execFileSync('unzip', ['-q', zipFile, '-d', destination], {stdio: 'inherit'});
}

async function main() {
    fs.mkdirSync(runtimeRoot, {recursive: true});

    const existingPhp = path.join(targetDir, 'php.exe');
    const existingIni = path.join(targetDir, 'php.ini');
    if (fs.existsSync(existingPhp) && fs.existsSync(existingIni) &&
        fs.readFileSync(existingIni, 'utf8') === fs.readFileSync(path.join(desktopRoot, 'php.ini'), 'utf8')) {
        copyVCRuntime(targetDir);
        console.log('PHP runtime already present: ' + targetDir);
        return;
    }

    console.log('Downloading PHP ' + PHP_VERSION + ' for Windows...');
    await download(PHP_URL, archive);

    const digest = sha256(archive);
    if (digest !== PHP_SHA256) {
        throw new Error('PHP checksum mismatch.\nExpected: ' + PHP_SHA256 + '\nReceived: ' + digest);
    }

    fs.rmSync(targetDir, {recursive: true, force: true});
    fs.mkdirSync(targetDir, {recursive: true});
    extract(archive, targetDir);

    const phpExe = path.join(targetDir, 'php.exe');
    if (!fs.existsSync(phpExe)) {
        throw new Error('php.exe was not found after extracting the runtime');
    }

    fs.copyFileSync(path.join(desktopRoot, 'php.ini'), path.join(targetDir, 'php.ini'));
    copyVCRuntime(targetDir);
    fs.rmSync(archive, {force: true});

    console.log('PHP runtime ready: ' + targetDir);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
