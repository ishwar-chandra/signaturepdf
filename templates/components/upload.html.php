<?php
$uploadImagesOnly = isset($uploadImagesOnly) && $uploadImagesOnly;
$uploadLabel = $uploadImagesOnly ? _("Choose images") : _("Choose a PDF");
$uploadAccept = $uploadImagesOnly ? '.png,.jpg,.jpeg,image/png,image/jpeg' : '.pdf,application/pdf';
if (isset($uploadImgAuhtorized) && !$uploadImagesOnly) {
    $uploadAccept .= ',image/png,image/jpeg';
}
?>
<div id="upload_drag_zone" class="block-drag mt-4 col-md-8 col-lg-6 col-xl-5 col-xxl-4 mx-auto border rounded-2 <?php if ($PDF_DEMO_LINK && !isset($uploadNoDemo)): ?>rounded-bottom-0<?php endif; ?> border-dark-subtle p-4 shadow-sm position-relative" style="border-style: dashed !important; cursor: pointer;" role="<?php echo $uploadLabel; ?>" aria="link" tabindex="0">
    <?php if(isset($uploadHelp)): ?>
    <small class="opacity-75 position-absolute" style="cursor: help; right: 8px; top: 5px;" title="<?php echo $uploadHelp ?>"><i class="bi bi-question-circle"></i></small>
    <?php endif; ?>
    <label class="form-label" for="input_pdf_upload"><?php echo $uploadLabel; ?><?php if($uploadImagesOnly): ?><small class="opacity-50 d-block"><?php echo _("PNG or JPEG"); ?></small><?php elseif(isset($uploadImgAuhtorized)): ?><small class="opacity-50 d-block"><?php echo _("or an image"); ?></small><?php else: ?><small class="d-block">&nbsp;</small><?php endif; ?></label>
    <div><i class="bi bi-upload fs-2"></i></div>
    <input id="input_pdf_upload" name="pdf" placeholder="<?php echo $uploadLabel; ?>" class="form-control d-none mt-3" type="file" accept="<?php echo $uploadAccept; ?>" <?php if(isset($uploadMultiple) && $uploadMultiple): ?>multiple="true"<?php endif; ?> />
    <p id="upload_file_name" class="upload-file-name d-none mt-2 mb-0 small" aria-live="polite"></p>
</div>
<?php if ($PDF_DEMO_LINK && !isset($uploadNoDemo)): ?>
    <a  id="demo_link" href="#<?php echo $PDF_DEMO_LINK; ?>" class="block-drag d-block col-md-8 col-lg-6 col-xl-5 col-xxl-4 mx-auto border rounded-2 rounded-top-0 border-top-0 border-dark-subtle p-1 shadow-sm position-relative text-secondary small" style="border-style: dashed !important; cursor: pointer;"><small class="opacity-75"><?php echo _("Test with a demo PDF"); ?></small></a>
<?php endif; ?>
<?php if(isset($uploadOffline) || $LOCAL_ONLY): ?>
<p class="mt-3 mb-3 small opacity-50"><i class="bi bi-wifi-off"></i> <?php echo _("Your file never leaves your device"); ?></p>
<?php else: ?>
<p class="mt-3 mb-3 small opacity-50"><i class="bi bi-wifi"></i> <?php echo _("The PDF will be processed by the server without being retained or stored"); ?></p>
<?php endif; ?>

<script>
    const dropArea = document.querySelector("#upload_drag_zone");
    const dropInput = dropArea.querySelector("input[type=file]");
    dropArea.addEventListener('click', function(e) {
        dropInput.click();
    });
    window.resetUploadFileName = function() {
        const fileName = document.querySelector('#upload_file_name');
        if (!fileName) {
            return;
        }
        fileName.innerText = '';
        fileName.classList.add('d-none');
    };

    document.querySelector('#upload_drag_zone input[type=file]').addEventListener('change', function(e) {
        dropArea.querySelector('.bi-upload').classList.add('d-none');
        this.classList.add('d-none');
        const fileName = dropArea.querySelector('.upload-file-name');
        fileName.innerText = Array.from(this.files || []).map(function(file) {
            return file.name;
        }).join(', ');
        fileName.classList.toggle('d-none', !this.files || !this.files.length);
    });
    document.body.addEventListener("dragover", (event) => {
        event.preventDefault();
        dropArea.classList.add("active");
    });

    document.body.addEventListener("dragleave", () => {
      dropArea.classList.remove("active");
    });

    document.body.addEventListener("drop", (e) => {
      e.preventDefault();
      const target = e.dataTransfer;
      dropArea.classList.remove("active");
      if(target.files.length < 1) {
            return;
      }
      dropInput.files = target.files
      dropInput.dispatchEvent(new Event("change"));
    });
</script>
