<!doctype html>
<html lang="<?php echo $TRANSLATION_LANGUAGE ?>" dir="<?php echo $DIRECTION_LANGUAGE ?>" style="direction: <?php echo $DIRECTION_LANGUAGE ?>;">
<head>
    <?php include('components/header.html.php'); ?>
    <title>Signature PDF - <?php echo _("Convert images to PDF"); ?></title>
    <meta name="description" content="<?php echo _("Convert PNG and JPEG images into a single PDF locally in your browser."); ?>">
</head>
<body>
<noscript>
    <div class="alert alert-danger text-center" role="alert">
        <i class="bi bi-exclamation-triangle"></i> <?php echo _("Site not functional without JavaScript enabled"); ?>
    </div>
</noscript>
<div id="page-upload">
    <?php include('components/navtab.html.php'); ?>
    <div class="px-3 py-3 text-center fullpage">
        <a id="btn_exit" class="btn btn-close btn-sm position-absolute d-none" style="right: 16px;" title="<?php echo _("Close and return to the homepage"); ?>" href="<?php echo $REVERSE_PROXY_URL; ?>/"></a>
        <i class="bi bi-images display-3 icon-images"></i>
        <h1 class="mb-0 h2 mt-3"><?php echo _("Images to PDF"); ?></h1>
        <p class="text-nowrap mt-2 pb-2" style="overflow: hidden; text-overflow: ellipsis;"><?php echo _("Combine your images into one PDF, locally"); ?></p>

        <?php
        $uploadImagesOnly = true;
        $uploadMultiple = true;
        $uploadImgAuhtorized = true;
        $uploadNoDemo = true;
        $uploadOffline = true;
        $uploadHelp = _("Select several PNG or JPEG images. Reorder them before creating the PDF.");
        include "components/upload.html.php";
        ?>

        <div class="col-md-7 col-lg-6 col-xl-5 mx-auto mt-4">
            <div class="row g-2 text-start">
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="image_page_size"><?php echo _("Page size"); ?></label>
                    <select id="image_page_size" class="form-select form-select-sm">
                        <option value="a4" selected>A4</option>
                        <option value="letter">Letter</option>
                        <option value="fit"><?php echo _("Same as image"); ?></option>
                    </select>
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="image_orientation"><?php echo _("Orientation"); ?></label>
                    <select id="image_orientation" class="form-select form-select-sm">
                        <option value="auto" selected><?php echo _("Automatic"); ?></option>
                        <option value="portrait"><?php echo _("Portrait"); ?></option>
                        <option value="landscape"><?php echo _("Landscape"); ?></option>
                    </select>
                </div>
                <div class="col-sm-4">
                    <label class="form-label small mb-1" for="image_margin"><?php echo _("Margin"); ?></label>
                    <select id="image_margin" class="form-select form-select-sm">
                        <option value="0" selected>0 mm</option>
                        <option value="5">5 mm</option>
                        <option value="10">10 mm</option>
                        <option value="20">20 mm</option>
                    </select>
                </div>
            </div>
        </div>

        <div id="image_list" class="row justify-content-center g-3 mt-3 mx-auto" style="max-width: 960px;"></div>

        <div id="image_actions" class="d-none mt-2">
            <button type="button" id="create_image_pdf" class="btn btn-primary" data-loading-text="<?php echo _("Creating PDF"); ?>"><i class="bi bi-file-earmark-pdf"></i> <?php echo _("Create the PDF"); ?></button>
            <button type="button" id="clear_images" class="btn btn-outline-secondary ms-2"><i class="bi bi-trash"></i> <?php echo _("Clear"); ?></button>
        </div>

        <div id="image_error" class="alert alert-warning mt-4 d-none"></div>

        <div id="image_result" class="card text-bg-light shadow mt-4 col-md-7 col-lg-6 col-xl-5 mx-auto d-none">
            <div class="card-body">
                <h6 class="card-title mt-2"><i class="bi bi-file-earmark-pdf"></i> <span id="image_pdf_size"></span></h6>
                <input id="input_image_pdf" class="form-control d-none" type="file" />
                <button type="button" id="download_image_pdf" class="btn btn-primary mt-3"><i class="bi bi-download"></i> <?php echo _("Download the PDF"); ?></button>
            </div>
        </div>
    </div>
    <?php include('components/footer.html.php'); ?>
</div>

<?php $loadJs = ['pdf-lib.js' => true]; include('components/common.html.php'); ?>
<script>
    var trad = <?php echo json_encode([
        'Choose PNG or JPEG images.' => _("Choose PNG or JPEG images."),
        'Creating PDF' => _("Creating PDF"),
        'Page %s of %s' => _("Page %s of %s"),
        'The PDF could not be created.' => _("The PDF could not be created."),
        'Remove' => _("Remove"),
        'Move up' => _("Move up"),
        'Move down' => _("Move down"),
        'images' => _("images")
    ]); ?>;
</script>
<script src="<?php echo $REVERSE_PROXY_URL; ?>/js/image-to-pdf.js?<?php echo ($COMMIT) ? $COMMIT : filemtime($ROOT."/public/js/image-to-pdf.js") ?>"></script>
</body>
</html>
