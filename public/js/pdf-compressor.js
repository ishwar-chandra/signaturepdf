/**
 * Browser-side PDF compressor used when Ghostscript is unavailable (for
 * example in the local desktop build). Pages are rendered with PDF.js and
 * re-embedded as JPEG images, so text becomes non-selectable. This is the
 * trade-off that makes target-size compression possible without any server
 * or external binary.
 *
 * To keep target-size compression usable, each resolution is rendered only
 * once; several JPEG qualities are encoded from that render before dropping
 * to a lower resolution.
 */
window.LocalPDFCompressor = (function() {
    const PRESETS = {
        low: {dpi: 150, quality: 0.86},
        medium: {dpi: 120, quality: 0.72},
        high: {dpi: 96, quality: 0.55}
    };

    // Highest quality first. Lower-resolution phases are only rendered when
    // the previous phase cannot reach the requested target.
    const TARGET_PHASES = [
        {dpi: 96, qualities: [0.80, 0.65, 0.50, 0.35, 0.22]},
        {dpi: 64, qualities: [0.60, 0.45, 0.30, 0.20]},
        {dpi: 44, qualities: [0.50, 0.35, 0.20]},
        {dpi: 32, qualities: [0.40, 0.25, 0.15]},
        {dpi: 24, qualities: [0.30, 0.18]},
        {dpi: 20, qualities: [0.25, 0.12]}
    ];

    function canvasToBlob(canvas, type, quality) {
        return new Promise(function(resolve, reject) {
            canvas.toBlob(function(blob) {
                if(blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Unable to encode page'));
                }
            }, type, quality);
        });
    }

    async function renderAtDpi(pdf, dpi, qualities, onPage) {
        const encodedPages = [];

        for(let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            if(onPage) {
                onPage(pageNumber, pdf.numPages, dpi);
            }

            const page = await pdf.getPage(pageNumber);
            const pointsViewport = page.getViewport({scale: 1});
            let scale = dpi / 72;
            let viewport = page.getViewport({scale: scale});

            // Keep memory bounded for unusually large pages.
            const maxPixels = 16000000;
            if(viewport.width * viewport.height > maxPixels) {
                scale *= Math.sqrt(maxPixels / (viewport.width * viewport.height));
                viewport = page.getViewport({scale: scale});
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(viewport.width));
            canvas.height = Math.max(1, Math.round(viewport.height));
            const context = canvas.getContext('2d', {alpha: false});
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const versions = [];
            for(let index = 0; index < qualities.length; index++) {
                const blob = await canvasToBlob(canvas, 'image/jpeg', qualities[index]);
                versions.push(new Uint8Array(await blob.arrayBuffer()));
            }

            encodedPages.push({
                width: pointsViewport.width,
                height: pointsViewport.height,
                versions: versions
            });

            canvas.width = 0;
            canvas.height = 0;
        }

        return encodedPages;
    }

    async function buildPdf(encodedPages, qualityIndex) {
        const PDFDocument = window['PDFLib'].PDFDocument;
        const output = await PDFDocument.create();

        for(let index = 0; index < encodedPages.length; index++) {
            const pageData = encodedPages[index];
            const image = await output.embedJpg(pageData.versions[qualityIndex]);
            const page = output.addPage([pageData.width, pageData.height]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: pageData.width,
                height: pageData.height
            });
        }

        const bytes = await output.save();
        return {
            blob: new Blob([bytes], {type: 'application/pdf'}),
            size: bytes.length
        };
    }

    async function compress(file, options) {
        options = options || {};
        const targetBytes = options.targetBytes ? Number(options.targetBytes) : null;

        if(targetBytes && file.size <= targetBytes) {
            return {
                blob: file,
                filename: file.name,
                originalSize: file.size,
                size: file.size,
                targetMet: true,
                optimized: false,
                attempts: 0
            };
        }

        const pdf = await window.pdfjsLib.getDocument({data: await file.arrayBuffer()}).promise;
        let smallest = null;
        let targetMet = false;

        if(!targetBytes) {
            const preset = PRESETS[options.compressionType] || PRESETS.medium;
            const encoded = await renderAtDpi(pdf, preset.dpi, [preset.quality], function(page, pages) {
                if(options.onProgress) {
                    options.onProgress({attempt: 1, attempts: 1, page: page, pages: pages});
                }
            });
            smallest = await buildPdf(encoded, 0);
        } else {
            const totalAttempts = TARGET_PHASES.reduce(function(total, phase) {
                return total + phase.qualities.length;
            }, 0);
            let attempt = 0;

            for(let phaseIndex = 0; phaseIndex < TARGET_PHASES.length && !targetMet; phaseIndex++) {
                const phase = TARGET_PHASES[phaseIndex];
                const encoded = await renderAtDpi(pdf, phase.dpi, phase.qualities, function(page, pages) {
                    if(options.onProgress) {
                        options.onProgress({
                            attempt: attempt + 1,
                            attempts: totalAttempts,
                            page: page,
                            pages: pages
                        });
                    }
                });

                for(let qualityIndex = 0; qualityIndex < phase.qualities.length; qualityIndex++) {
                    attempt++;
                    const result = await buildPdf(encoded, qualityIndex);

                    if(!smallest || result.size < smallest.size) {
                        smallest = result;
                    }
                    if(result.size <= targetBytes) {
                        targetMet = true;
                        break;
                    }
                }
            }
        }

        if(pdf.destroy) {
            await pdf.destroy();
        }

        if(targetBytes && smallest && smallest.size >= file.size) {
            // Never make a file larger just because a target was requested.
            smallest = {blob: file, size: file.size};
            targetMet = false;
        }

        return {
            blob: smallest.blob,
            filename: smallest.size < file.size ?
                file.name.replace(/\.pdf$/i, '') + '_compressed.pdf' : file.name,
            originalSize: file.size,
            size: smallest.size,
            targetMet: targetMet,
            optimized: smallest.size < file.size,
            attempts: targetBytes ? TARGET_PHASES.reduce(function(total, phase) {
                return total + phase.qualities.length;
            }, 0) : 1
        };
    }

    return {
        compress: compress,
        isAvailable: function() {
            return !!(window.pdfjsLib && window.PDFLib && window.PDFLib.PDFDocument);
        }
    };
})();
