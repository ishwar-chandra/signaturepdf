<div class="p-2 mb-3">
    <nav class=" rounded pb-2 mx-auto position-relative">
        <a class="link-dark" href="<?php echo $REVERSE_PROXY_URL; ?>/"><img src="logo-small.svg" alt="Logo de signature pdf" style="height: 42px; position: absolute;top: 6px;left: 8px;" />
        <span class="d-none d-lg-inline" style="font-size: 15px; position: absolute;top: 10px;left: 56px;">Signature PDF</span>
        <span class="opacity-50 d-none d-lg-inline" style="font-size: 12px; position: absolute;top: 30px;left: 56px;"><?php echo _("Sign and manipulate PDFs freely"); ?></span></a>
        <div class="d-flex align-items-center gap-2 position-absolute top-0 end-0 mt-2 me-2">
            <button class="btn btn-light theme-toggle" type="button" id="theme-toggle"
                    aria-pressed="false"
                    data-label-dark="<?php echo _("Switch to dark mode"); ?>"
                    data-label-light="<?php echo _("Switch to light mode"); ?>"
                    data-text-dark="<?php echo _("Dark mode"); ?>"
                    data-text-light="<?php echo _("Light mode"); ?>"
                    title="<?php echo _("Switch to dark mode"); ?>">
                <i class="bi bi-moon-stars-fill" id="theme-toggle-icon"></i>
                <span class="d-none d-lg-inline" id="theme-toggle-label"><?php echo _("Dark mode"); ?></span>
            </button>
            <div class="dropdown">
                <button class="btn btn-light dropdown-toggle" type="button" id="dropdownMenuButton1" data-bs-toggle="dropdown" aria-expanded="false">
                    <i class='bi bi-translate'></i><span class="d-none d-lg-inline"> <?php echo _("Language"); ?></span>
                </button>
                <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="dropdownMenuButton1">
                    <?php foreach ($SUPPORTED_LANGUAGES as $key => $langue): ?>
                        <li><a class="dropdown-item" href="?lang=<?php echo $key; ?>"><?php echo $langue; ?></a></li>
                    <?php endforeach; ?>
                </ul>
            </div>
        </div>
        <ul class="nav nav-pills justify-content-center pt-2">
            <?php if (!$disableOrganization): ?>
            <li class="nav-item">
                <a class="nav-link <?php if ($activeTab === "index"): ?>active<?php endif; ?>" href="<?php echo $REVERSE_PROXY_URL; ?>/"><i class="bi bi-search"></i><span class="d-none d-md-inline-block"></span></a>
            </li>
            <?php endif; ?>
            <li class="nav-item <?php if ($disableOrganization): ?>invisible<?php endif; ?>">
                <a class="nav-link <?php if ($activeTab === "sign"): ?>active<?php endif; ?>" href="<?php echo $REVERSE_PROXY_URL; ?>/signature"><i class="bi bi-vector-pen icon-sign"></i> <span class="d-none d-md-inline-block"><?php echo _("Sign"); ?></span></a>
            </li>
            <li class="nav-item">
                <a class="nav-link <?php if ($activeTab === "image-to-pdf"): ?>active<?php endif; ?>" href="<?php echo $REVERSE_PROXY_URL; ?>/image-to-pdf"><i class="bi bi-images icon-images"></i> <span class="d-none d-md-inline-block"><?php echo _("Images"); ?></span></a>
            </li>
            <?php if (!$disableOrganization): ?>
            <li class="nav-item">
                <a class="nav-link <?php if ($activeTab === "organize"): ?>active<?php endif; ?>" href="<?php echo $REVERSE_PROXY_URL; ?>/organization"><i class="bi bi-ui-checks-grid icon-organize"></i> <span class="d-none d-md-inline-block"><?php echo _("Organize",); ?></span></a>
            </li>
            <li class="nav-item">
                <a class="nav-link <?php if ($activeTab === "metadata"): ?>active<?php endif; ?>" href="<?php echo $REVERSE_PROXY_URL; ?>/metadata"><i class="bi bi-tags icon-metadata"></i> <span class="d-none d-md-inline-block"><?php echo _("Metadata"); ?></span></a>
            </li>
            <li class="nav-item">
                <a class="nav-link <?php if ($activeTab === "compress"): ?>active<?php endif; ?>"  href="<?php echo $REVERSE_PROXY_URL; ?>/compress"><i class="bi bi-chevron-bar-contract icon-compress"></i> <span class="d-none d-md-inline-block"><?php echo _("Compress"); ?></span></a>
            </li>
            <?php endif; ?>
        </ul>
    </nav>
</div>
