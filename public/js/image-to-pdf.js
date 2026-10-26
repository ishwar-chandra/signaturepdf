/**
 * Client-side image to PDF converter. Images never leave the browser: they
 * are normalized through a canvas (EXIF orientation included) and embedded
 * with pdf-lib.
 */
(function() {
    const MM_TO_PT = 72 / 25.4;
    const MAX_IMAGE_DIMENSION = 4000;
    const MAX_IMAGES = 100;
    const PAGE_SIZES = {
        a4: {width: 595.28, height: 841.89},
        letter: {width: 612, height: 792}
    };

    let images = [];
    let nextId = 1;

    function imageError(message) {
        const element = document.getElementById('image_error');
        element.classList.remove('d-none');
        element.innerText = message;
    }

    function clearImageError() {
        document.getElementById('image_error').classList.add('d-none');
    }

    function formatSize(bytes) {
        if(bytes >= 1000000) {
            return (bytes / 1000000).toFixed(2) + ' MB';
        }
        return Math.ceil(bytes / 1000) + ' KB';
    }

    function renderImages() {
        const list = document.getElementById('image_list');
        list.innerHTML = '';

        images.forEach(function(image, index) {
            const column = document.createElement('div');
            column.className = 'col-6 col-sm-4 col-lg-3';

            const card = document.createElement('div');
            card.className = 'card h-100 shadow-sm';

            const preview = document.createElement('img');
            preview.src = image.url;
            preview.alt = '';
            preview.className = 'card-img-top';
            preview.style.height = '130px';
            preview.style.objectFit = 'cover';
            card.appendChild(preview);

            const body = document.createElement('div');
            body.className = 'card-body p-2 text-start';

            const name = document.createElement('div');
            name.className = 'small text-truncate';
            name.title = image.file.name;
            name.innerText = image.file.name;
            body.appendChild(name);

            const size = document.createElement('div');
            size.className = 'small text-muted';
            size.innerText = formatSize(image.file.size);
            body.appendChild(size);

            const controls = document.createElement('div');
            controls.className = 'btn-group btn-group-sm mt-2 w-100';

            const up = document.createElement('button');
            up.type = 'button';
            up.className = 'btn btn-outline-secondary';
            up.title = trad['Move up'];
            up.setAttribute('aria-label', trad['Move up']);
            up.dataset.action = 'up';
            up.dataset.id = image.id;
            up.disabled = index === 0;
            up.innerHTML = '<i class="bi bi-arrow-up"></i>';
            controls.appendChild(up);

            const down = document.createElement('button');
            down.type = 'button';
            down.className = 'btn btn-outline-secondary';
            down.title = trad['Move down'];
            down.setAttribute('aria-label', trad['Move down']);
            down.dataset.action = 'down';
            down.dataset.id = image.id;
            down.disabled = index === images.length - 1;
            down.innerHTML = '<i class="bi bi-arrow-down"></i>';
            controls.appendChild(down);

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn btn-outline-danger';
            remove.title = trad['Remove'];
            remove.setAttribute('aria-label', trad['Remove']);
            remove.dataset.action = 'remove';
            remove.dataset.id = image.id;
            remove.innerHTML = '<i class="bi bi-x-lg"></i>';
            controls.appendChild(remove);

            body.appendChild(controls);
            card.appendChild(body);
            column.appendChild(card);
            list.appendChild(column);
        });

        const hasImages = images.length > 0;
        document.getElementById('image_actions').classList.toggle('d-none', !hasImages);
        document.getElementById('image_page_size').disabled = !hasImages;
        document.getElementById('image_orientation').disabled = !hasImages;
        document.getElementById('image_margin').disabled = !hasImages;

        if(!hasImages) {
            document.getElementById('image_result').classList.add('d-none');
        }
    }

    function addFiles(fileList) {
        clearImageError();
        document.getElementById('image_result').classList.add('d-none');
        const files = Array.from(fileList);
        const accepted = [];
        const rejected = [];

        files.forEach(function(file) {
            if(['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
                accepted.push(file);
            } else {
                rejected.push(file);
            }
        });

        if(images.length + accepted.length > MAX_IMAGES) {
            imageError(trad['Choose PNG or JPEG images.'] + ' (' + MAX_IMAGES + ')');
            return;
        }

        accepted.forEach(function(file) {
            images.push({
                id: nextId++,
                file: file,
                url: URL.createObjectURL(file)
            });
        });

        if(rejected.length) {
            imageError(trad['Choose PNG or JPEG images.']);
        }

        renderImages();
    }

    function removeImage(id) {
        const index = images.findIndex(function(image) { return image.id === id; });
        if(index === -1) {
            return;
        }
        document.getElementById('image_result').classList.add('d-none');
        URL.revokeObjectURL(images[index].url);
        images.splice(index, 1);
        renderImages();
    }

    function moveImage(id, direction) {
        const index = images.findIndex(function(image) { return image.id === id; });
        const target = index + direction;
        if(index === -1 || target < 0 || target >= images.length) {
            return;
        }
        document.getElementById('image_result').classList.add('d-none');
        const item = images[index];
        images.splice(index, 1);
        images.splice(target, 0, item);
        renderImages();
    }

    function clearImages() {
        images.forEach(function(image) {
            URL.revokeObjectURL(image.url);
        });
        images = [];
        document.getElementById('input_pdf_upload').value = '';
        if (window.resetUploadFileName) {
            window.resetUploadFileName();
        }
        document.getElementById('image_result').classList.add('d-none');
        clearImageError();
        renderImages();
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise(function(resolve, reject) {
            canvas.toBlob(function(blob) {
                if(blob) {
                    resolve(blob);
                } else {
                    reject(new Error(trad['The PDF could not be created.']));
                }
            }, type, quality);
        });
    }

    async function normalizeImage(file) {
        let bitmap = null;
        let source = null;
        let objectUrl = null;

        if(window.createImageBitmap) {
            try {
                bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'});
                source = bitmap;
            } catch (e) {
                bitmap = null;
            }
        }

        if(!source) {
            objectUrl = URL.createObjectURL(file);
            const image = new Image();
            image.src = objectUrl;
            await image.decode();
            source = image;
        }

        let width = source.width || source.naturalWidth;
        let height = source.height || source.naturalHeight;
        const factor = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
        width = Math.max(1, Math.round(width * factor));
        height = Math.max(1, Math.round(height * factor));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');

        const isJpeg = file.type === 'image/jpeg' || file.type === 'image/jpg';
        if(isJpeg) {
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, width, height);
        }
        context.drawImage(source, 0, 0, width, height);

        const mime = isJpeg ? 'image/jpeg' : 'image/png';
        const blob = await canvasToBlob(canvas, mime, isJpeg ? 0.95 : undefined);

        if(bitmap && bitmap.close) {
            bitmap.close();
        }
        if(objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
        canvas.width = 0;
        canvas.height = 0;

        return {
            bytes: new Uint8Array(await blob.arrayBuffer()),
            mime: mime,
            width: width,
            height: height
        };
    }

    function layoutPage(image, options) {
        const margin = options.margin * MM_TO_PT;

        if(options.pageSize === 'fit') {
            let width = image.width * 0.75;
            let height = image.height * 0.75;
            const maxEdge = Math.max(1, 842 - margin * 2);
            const factor = Math.min(1, maxEdge / Math.max(width, height));
            width *= factor;
            height *= factor;

            return {
                pageWidth: width + margin * 2,
                pageHeight: height + margin * 2,
                x: margin,
                y: margin,
                width: width,
                height: height
            };
        }

        const size = PAGE_SIZES[options.pageSize] || PAGE_SIZES.a4;
        const landscape = options.orientation === 'landscape' ||
            (options.orientation === 'auto' && image.width > image.height);
        const pageWidth = landscape ? size.height : size.width;
        const pageHeight = landscape ? size.width : size.height;
        const availableWidth = Math.max(1, pageWidth - margin * 2);
        const availableHeight = Math.max(1, pageHeight - margin * 2);
        const factor = Math.min(availableWidth / image.width, availableHeight / image.height);
        const width = image.width * factor;
        const height = image.height * factor;

        return {
            pageWidth: pageWidth,
            pageHeight: pageHeight,
            x: (pageWidth - width) / 2,
            y: (pageHeight - height) / 2,
            width: width,
            height: height
        };
    }

    async function createPdf(button) {
        clearImageError();
        document.getElementById('image_result').classList.add('d-none');

        if(!images.length) {
            imageError(trad['Choose PNG or JPEG images.']);
            return;
        }

        if(!window.PDFLib || !window.PDFLib.PDFDocument) {
            imageError(trad['The PDF could not be created.']);
            return;
        }

        const options = {
            pageSize: document.getElementById('image_page_size').value,
            orientation: document.getElementById('image_orientation').value,
            margin: parseFloat(document.getElementById('image_margin').value) || 0
        };

        startProcessingMode(button);
        try {
            const PDFDocument = window.PDFLib.PDFDocument;
            const documentPdf = await PDFDocument.create();

            for(let index = 0; index < images.length; index++) {
                document.querySelector('#modalLoading p').innerText =
                    trad['Page %s of %s'].replace('%s', index + 1).replace('%s', images.length);

                const normalized = await normalizeImage(images[index].file);
                const embedded = normalized.mime === 'image/png' ?
                    await documentPdf.embedPng(normalized.bytes) :
                    await documentPdf.embedJpg(normalized.bytes);
                const layout = layoutPage(normalized, options);
                const page = documentPdf.addPage([layout.pageWidth, layout.pageHeight]);
                page.drawImage(embedded, {
                    x: layout.x,
                    y: layout.y,
                    width: layout.width,
                    height: layout.height
                });
            }

            const bytes = await documentPdf.save();
            const blob = new Blob([bytes], {type: 'application/pdf'});
            const filename = images.length === 1 ?
                images[0].file.name.replace(/\.[^.]+$/, '') + '.pdf' :
                'images.pdf';

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(new File([blob], filename, {type: 'application/pdf'}));
            document.getElementById('input_image_pdf').files = dataTransfer.files;
            document.getElementById('image_pdf_size').innerText =
                filename + ' - ' + formatSize(blob.size) + ' - ' + images.length + ' ' + trad['images'];
            document.getElementById('image_result').classList.remove('d-none');
            document.getElementById('download_image_pdf').focus();
        } catch (error) {
            console.error(error);
            imageError(error.message || trad['The PDF could not be created.']);
        } finally {
            endProcessingMode(button);
        }
    }

    function initImageToPdf() {
        const input = document.getElementById('input_pdf_upload');
        input.addEventListener('change', function() {
            addFiles(this.files);
            this.value = '';
            document.querySelector('#upload_drag_zone .bi-upload').classList.remove('d-none');
            document.querySelector('#upload_drag_zone input[type=file]').classList.add('d-none');
        });

        document.getElementById('image_list').addEventListener('click', function(event) {
            const button = event.target.closest('button[data-action]');
            if(!button) {
                return;
            }
            const id = parseInt(button.dataset.id, 10);
            if(button.dataset.action === 'remove') {
                removeImage(id);
            } else if(button.dataset.action === 'up') {
                moveImage(id, -1);
            } else if(button.dataset.action === 'down') {
                moveImage(id, 1);
            }
        });

        ['image_page_size', 'image_orientation', 'image_margin'].forEach(function(id) {
            document.getElementById(id).addEventListener('change', function() {
                document.getElementById('image_result').classList.add('d-none');
            });
        });

        document.getElementById('create_image_pdf').addEventListener('click', function() {
            createPdf(this);
        });
        document.getElementById('clear_images').addEventListener('click', clearImages);
        document.getElementById('download_image_pdf').addEventListener('click', function() {
            const file = document.getElementById('input_image_pdf').files[0];
            if(file) {
                download(file, file.name);
            }
        });

        renderImages();
    }

    initImageToPdf();
})();
