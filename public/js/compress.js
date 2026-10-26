let isDavPath = false;
let compressionCapabilities = null;
function compressionShouldUseLocal() {
    if(localOnly) {
        return !compressionCapabilities || !compressionCapabilities.ghostscript;
    }
    return !!(compressionCapabilities && compressionCapabilities.ghostscript === false);
}

function compressionFilename(header, fallback) {
    if(!header) {
        return fallback;
    }
    let match = header.match(/filename\*=UTF-8''([^;]+)/i);
    if(match) {
        try {
            return decodeURIComponent(match[1]);
        } catch (e) {}
    }
    match = header.match(/filename="?([^";]+)"?/i);
    return match ? match[1] : fallback;
}

function compressedName(file) {
    return file.name.replace(/\.pdf$/i, '') + '_compressed.pdf';
}

function showCompressionError(message) {
    document.querySelector('#error_message').classList.remove('d-none');
    document.querySelector('#error_message').innerText = message;
}

function showCompressionResult(blob, filename, originalFile, targetKb, targetMet) {
    document.querySelector('#card_resultat h6').classList.remove('d-none');
    document.querySelector('#compressBtn').classList.remove('btn-primary');
    document.querySelector('#compressBtn').classList.add('btn-outline-primary');

    const uploadedSize = document.querySelector('#uploaded_size');
    const compressedSize = document.querySelector('#size_compressed');
    uploadedSize.innerText = uploadedSize.dataset.templateText.replace("%s", convertOctet2MegoOctet(originalFile.size));
    compressedSize.innerText = compressedSize.dataset.templateText.replace("%s", convertOctet2MegoOctet(blob.size));

    const percentage = 100 - Math.round((blob.size * 100) / originalFile.size);
    document.querySelector('#pourcentage_compressed').innerText = document.querySelector('#pourcentage_compressed').dataset.templateText.replace("%s", percentage);
    document.querySelector('#card_resultat').classList.remove('d-none');

    if(targetKb) {
        if(targetMet) {
            showCompressionError(trad["Target size reached"] + " (" + convertOctet2MegoOctet(blob.size) + " MB)");
            document.querySelector('#error_message').classList.remove('alert-warning');
            document.querySelector('#error_message').classList.add('alert-success');
        } else {
            showCompressionError(trad["The target size could not be reached. The smallest PDF is shown."]);
            document.querySelector('#error_message').classList.remove('alert-success');
            document.querySelector('#error_message').classList.add('alert-warning');
        }
    } else {
        document.querySelector('#error_message').classList.add('d-none');
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], filename, {type: 'application/pdf'}));
    document.getElementById('input_pdf_compressed').files = dataTransfer.files;
    document.querySelector('#downloadBtn').focus();

    if(isDavPath) {
        document.querySelector('#downloadBtn').classList.add('d-none');
        document.querySelector('#save_local').classList.remove('d-none');
    }
}

async function compressLocally(file, targetKb, compressionType) {
    if(!window.LocalPDFCompressor || !LocalPDFCompressor.isAvailable()) {
        throw new Error(trad["Browser compression is not available"]);
    }

    const result = await LocalPDFCompressor.compress(file, {
        targetBytes: targetKb ? targetKb * 1000 : null,
        compressionType: compressionType,
        onProgress: function(progress) {
            const text = targetKb ?
                trad["Compressing page %s of %s (attempt %s)"].replace("%s", progress.page).replace("%s", progress.pages).replace("%s", progress.attempt) :
                trad["Compressing page %s of %s"].replace("%s", progress.page).replace("%s", progress.pages);
            document.querySelector('#modalLoading p').innerText = text;
        }
    });

    if(!result.optimized) {
        showCompressionError(targetKb ?
            trad["The target size could not be reached. The smallest PDF is shown."] :
            trad["Your pdf is already optimized"]);
        return;
    }

    showCompressionResult(result.blob, result.filename, file, targetKb, result.targetMet);
}

async function compressOnServer(action, formData, file, targetKb) {
    const response = await fetch(action, {method: 'POST', body: formData});

    if(response.status == 204) {
        if(targetKb) {
            return false;
        }
        showCompressionError(trad["Your pdf is already optimized"]);
        return true;
    }

    if(!response.ok) {
        showCompressionError(await response.text());
        return false;
    }

    let blob = await response.blob();
    let filename = compressionFilename(response.headers.get('content-disposition'), compressedName(file));
    let targetMet = response.headers.get('X-Compression-Target-Met') !== 'false';
    if(targetKb && blob.size > targetKb * 1000) {
        targetMet = false;
    }

    // Ghostscript cannot always reach an aggressive target on vector PDFs.
    // Rasterizing in the browser is a last resort that usually can.
    if(targetKb && !targetMet && window.LocalPDFCompressor && LocalPDFCompressor.isAvailable()) {
        try {
            const local = await LocalPDFCompressor.compress(file, {
                targetBytes: targetKb * 1000,
                compressionType: 'medium',
                onProgress: function(progress) {
                    document.querySelector('#modalLoading p').innerText =
                        trad["Compressing page %s of %s (attempt %s)"]
                            .replace("%s", progress.page)
                            .replace("%s", progress.pages)
                            .replace("%s", progress.attempt);
                }
            });
            if(local.targetMet || local.size < blob.size) {
                blob = local.blob;
                filename = local.filename;
                targetMet = local.targetMet;
            }
        } catch (error) {
            console.warn('Browser fallback compression failed', error);
        }
    }

    showCompressionResult(blob, filename, file, targetKb, targetMet);
    return true;
}

function handleFileChange() {
    document.querySelector('#error_message').classList.add('d-none');
    document.querySelector('#error_message').classList.remove('alert-success');
    document.querySelector('#error_message').classList.add('alert-warning');
    document.querySelector('#card_resultat').classList.add('d-none');
    document.querySelector('#compressBtn').classList.add('btn-primary');
    document.querySelector('#compressBtn').classList.remove('btn-outline-primary');
    const fileInput = document.getElementById('input_pdf_upload');

    if(fileInput.files[0] && fileInput.files[0].size > maxSize) {
        alert("Le PDF ne doit pas dépasser " + convertOctet2MegoOctet(maxSize) + " Mo");
        fileInput.value = null;
        if (window.resetUploadFileName) {
            window.resetUploadFileName();
        }
        return;
    }


    const compressBtn = document.getElementById('compressBtn');
    const dropdownCompressBtn = document.getElementById('dropdownMenuReference');

    if(fileInput.files.length > 0) {
        compressBtn.closest('.btn-group').classList.remove('opacity-25');
        compressBtn.disabled = false;
        dropdownCompressBtn.disabled = false;
    } else {
        compressBtn.closest('.btn-group').classList.add('opacity-25');
        compressBtn.disabled = true;
        dropdownCompressBtn.disabled = true;
    }
}

function initCompression() {
    document.querySelector('#input_pdf_upload').addEventListener('change', handleFileChange);

    document.getElementById('form_compress').addEventListener('submit', async function(e) {
        e.preventDefault();
        document.querySelector('#error_message').classList.add('d-none');
        document.querySelector('#error_message').classList.remove('alert-success');
        document.querySelector('#error_message').classList.add('alert-warning');
        document.querySelector('#card_resultat').classList.add('d-none');
        document.querySelector('#compressBtn').classList.add('btn-primary');
        document.querySelector('#compressBtn').classList.remove('btn-outline-primary');

        const submitter = e.submitter || document.getElementById('compressBtn');
        const submitValue = submitter.value || 'medium';
        const submitButton = submitValue == "ocr" ?
            document.getElementById('ocrButton') : document.getElementById('compressBtn');
        const file = document.getElementById('input_pdf_upload').files[0];
        if(!file) {
            return;
        }

        const targetKb = parseInt(document.getElementById('target_size_kb').value, 10);
        if(targetKb && targetKb < 5) {
            showCompressionError(trad["The target size must be at least 5 KB"]);
            return;
        }
        if(targetKb && targetKb * 1000 >= file.size) {
            showCompressionError(trad["The PDF is already smaller than the target size"]);
            return;
        }

        startProcessingMode(submitButton);
        try {
            if(submitValue == "ocr") {
                const formData = new FormData(e.target);
                formData.set(submitter.name, submitValue);
                await compressOnServer(submitter.dataset.action, formData, file, targetKb);
                if(!document.querySelector('#card_resultat').classList.contains('d-none')) {
                    document.querySelector('#card_resultat h6').classList.add('d-none');
                    document.querySelector('#pourcentage_compressed').innerText = 'PDF with OCR';
                }
            } else if(!compressionShouldUseLocal()) {
                const formData = new FormData(e.target);
                formData.set('compressionType', submitValue);
                const compressed = await compressOnServer(e.target.action, formData, file, targetKb);
                if(!compressed) {
                    if(window.LocalPDFCompressor && LocalPDFCompressor.isAvailable()) {
                        await compressLocally(file, targetKb, submitValue);
                    } else {
                        showCompressionError(trad["Your pdf is already optimized"]);
                    }
                }
            } else {
                await compressLocally(file, targetKb, submitValue);
            }
        } catch (error) {
            showCompressionError(error.message || String(error));
        } finally {
            endProcessingMode(submitButton);
        }
    });

    fetch((REVERSE_PROXY_URL || '') + '/api/capabilities')
        .then(function(response) { return response.ok ? response.json() : null; })
        .then(function(capabilities) { compressionCapabilities = capabilities; })
        .catch(function() { compressionCapabilities = null; });

    document.getElementById('downloadBtn').addEventListener('click', async function(e) {
        await download(document.getElementById('input_pdf_compressed').files[0], document.getElementById('input_pdf_compressed').files[0].name);
    });

    document.getElementById('save_local').addEventListener('click', async function(e) {
        startProcessingMode(this);
        if(window.location.hash && window.location.hash.match(/^\#dav/)) {
            let headers = new Headers();
            let davToken = await requestDavToken();
            headers.set('Authorization', 'Basic ' + btoa(davToken));
            await fetch(window.location.hash.replace('#dav:', '').replace(/\.pdf$/, '_compress.pdf'), {
                method: 'PUT',
                body: document.getElementById('input_pdf_compressed').files[0],
                headers: headers
            });
        }
        endProcessingMode(this);
        document.getElementById('btn_exit').click();
    });

    if(window.location.hash && window.location.hash.match(/^\#dav:/)) {
        isDavPath = true;
        document.getElementById('btn_exit').classList.remove('d-none');
        loadFileFromUrl(window.location.hash.replace(/^\#dav:/, '')).then(function() {
            document.getElementById('input_pdf_upload').dispatchEvent(new Event("change"));
        });
    }
}

initCompression();
