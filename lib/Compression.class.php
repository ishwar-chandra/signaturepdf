<?php

class Compression
{
    protected $pdfFile = null;
    protected $toClean = [];
    protected $targetMet = null;
    protected $outputSize = null;

    private static $ghostscriptBinary = null;
    private static $ghostscriptChecked = false;

    public function __construct($pdfFile) {
        $this->pdfFile = $pdfFile;
        $this->toClean[] = $pdfFile;
    }

    /**
     * Compress a PDF.
     *
     * @param string   $compressionType low|medium|high
     * @param int|null $targetBytes     optional target size in bytes; when set,
     *                                  quality is lowered until the output fits
     */
    public function compress($compressionType, $targetBytes = null) {
        if ($targetBytes !== null) {
            $targetBytes = (int) $targetBytes;
            if ($targetBytes <= 0) {
                throw new InvalidArgumentException('Target size must be greater than zero');
            }

            return $this->compressToTarget($targetBytes, $compressionType);
        }

        $outputFile = str_replace('.pdf', '_compressed.pdf', $this->pdfFile);
        $preset = self::presetFor($compressionType);

        $this->runGhostscript($preset, 0, $outputFile);
        $this->toClean[] = $outputFile;
        $this->outputSize = filesize($outputFile);

        return $outputFile;
    }

    /**
     * Try progressively stronger Ghostscript settings and return the first
     * output that fits the requested target. If the target cannot be reached,
     * the smallest output is returned and isTargetMet() reports false.
     */
    protected function compressToTarget($targetBytes, $compressionType) {
        $this->targetMet = false;

        $originalSize = @filesize($this->pdfFile);
        if ($originalSize !== false && $originalSize <= $targetBytes) {
            $this->targetMet = true;
            $this->outputSize = $originalSize;

            return $this->pdfFile;
        }

        $smallestFile = null;
        $smallestSize = PHP_INT_MAX;
        $attempt = 0;

        foreach (self::targetProfiles($compressionType) as $profile) {
            $attempt++;
            $outputFile = preg_replace('/\.pdf$/i', '', $this->pdfFile).'_target_'.$attempt.'.pdf';

            $this->runGhostscript($profile['preset'], $profile['resolution'], $outputFile);
            $this->toClean[] = $outputFile;

            if (!is_file($outputFile)) {
                continue;
            }

            $size = filesize($outputFile);
            if ($size < $smallestSize) {
                $smallestFile = $outputFile;
                $smallestSize = $size;
            }

            if ($size <= $targetBytes) {
                $this->targetMet = true;
                $this->outputSize = $size;

                return $outputFile;
            }
        }

        if ($smallestFile === null) {
            throw new Exception('Compression failed');
        }

        $this->outputSize = $smallestSize;

        return $smallestFile;
    }

    /**
     * Quality ladder used for target-size compression. The first entry is the
     * highest quality; entries are tried in order until the target is met.
     */
    protected static function targetProfiles($compressionType) {
        $profiles = array(
            'low' => array(
                array('preset' => '/printer', 'resolution' => 300),
                array('preset' => '/ebook', 'resolution' => 240),
                array('preset' => '/ebook', 'resolution' => 180),
                array('preset' => '/screen', 'resolution' => 150),
                array('preset' => '/screen', 'resolution' => 120),
                array('preset' => '/screen', 'resolution' => 96),
                array('preset' => '/screen', 'resolution' => 72),
            ),
            'high' => array(
                array('preset' => '/screen', 'resolution' => 180),
                array('preset' => '/screen', 'resolution' => 150),
                array('preset' => '/screen', 'resolution' => 120),
                array('preset' => '/screen', 'resolution' => 96),
                array('preset' => '/screen', 'resolution' => 72),
                array('preset' => '/screen', 'resolution' => 60),
                array('preset' => '/screen', 'resolution' => 48),
            ),
        );

        $key = in_array($compressionType, array('low', 'high'), true) ? $compressionType : 'medium';

        if (!isset($profiles[$key])) {
            $profiles[$key] = array(
                array('preset' => '/ebook', 'resolution' => 240),
                array('preset' => '/ebook', 'resolution' => 200),
                array('preset' => '/screen', 'resolution' => 150),
                array('preset' => '/screen', 'resolution' => 120),
                array('preset' => '/screen', 'resolution' => 96),
                array('preset' => '/screen', 'resolution' => 72),
                array('preset' => '/screen', 'resolution' => 60),
            );
        }

        return $profiles[$key];
    }

    protected static function presetFor($compressionType) {
        if ($compressionType === 'medium') {
            return '/ebook';
        }
        if ($compressionType === 'low') {
            return '/printer';
        }

        return '/screen';
    }

    protected function runGhostscript($preset, $resolution, $outputFile) {
        $binary = self::findGhostscript();
        if (!$binary) {
            throw new Exception('Ghostscript is not installed');
        }

        $arguments = array(
            escapeshellarg($binary),
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.5',
            '-dPDFSETTINGS='.$preset,
            '-dNOPAUSE',
            '-dBATCH',
            '-dQUIET',
            '-dAutoRotatePages=/None',
            '-dPassThroughJPEGImages=false',
            '-dPassThroughJPXImages=false',
            '-dDetectDuplicateImages=true',
            '-dCompressFonts=true',
            '-dSubsetFonts=true',
            '-dEmbedAllFonts=true',
            '-dDownsampleColorImages=true',
            '-dColorImageDownsampleType=/Bicubic',
            '-dColorImageDownsampleThreshold=1.0',
            '-dDownsampleGrayImages=true',
            '-dGrayImageDownsampleType=/Bicubic',
            '-dGrayImageDownsampleThreshold=1.0',
            '-dDownsampleMonoImages=true',
            '-dMonoImageDownsampleType=/Subsample',
            '-dMonoImageDownsampleThreshold=1.0',
            '-dAutoFilterColorImages=false',
            '-dColorImageFilter=/DCTEncode',
            '-dAutoFilterGrayImages=false',
            '-dGrayImageFilter=/DCTEncode',
        );

        if ($resolution > 0) {
            $arguments[] = '-dColorImageResolution='.(int) $resolution;
            $arguments[] = '-dGrayImageResolution='.(int) $resolution;
            $arguments[] = '-dMonoImageResolution=300';
        }

        @unlink($outputFile);
        $arguments[] = '-o '.escapeshellarg($outputFile);
        $arguments[] = escapeshellarg($this->pdfFile);

        $output = array();
        $returnCode = 0;
        exec(implode(' ', $arguments).' 2>&1', $output, $returnCode);

        if ($returnCode !== 0 || !is_file($outputFile) || filesize($outputFile) === 0) {
            @unlink($outputFile);
            $details = trim(implode(' ', array_slice($output, -3)));
            throw new Exception('Compression failed'.($details !== '' ? ': '.$details : ''));
        }
    }

    public function isTargetMet() {
        return $this->targetMet;
    }

    public function getOutputSize() {
        return $this->outputSize;
    }

    public function clean() {
        foreach ($this->toClean as $file) {
            GPGCryptography::hardUnlink($file);
        }
    }

    /**
     * Locate Ghostscript on Linux/macOS and Windows, including a copy bundled
     * next to the desktop application.
     */
    public static function findGhostscript() {
        if (self::$ghostscriptChecked) {
            return self::$ghostscriptBinary;
        }
        self::$ghostscriptChecked = true;

        $candidates = array();

        $configured = getenv('GHOSTSCRIPT_PATH');
        if ($configured) {
            if (is_dir($configured)) {
                $candidates[] = rtrim($configured, '/\\').DIRECTORY_SEPARATOR.'gswin64c.exe';
                $candidates[] = rtrim($configured, '/\\').DIRECTORY_SEPARATOR.'gs';
            } else {
                $candidates[] = $configured;
            }
        }

        $candidates[] = 'gs';
        $candidates[] = 'gswin64c';
        $candidates[] = 'gswin32c';

        if (DIRECTORY_SEPARATOR === '\\') {
            $roots = array(
                getenv('ProgramFiles'),
                getenv('ProgramFiles(x86)'),
                'C:\\Program Files',
                'C:\\Program Files (x86)',
            );
            foreach (array_unique(array_filter($roots)) as $root) {
                foreach (glob($root.'\\gs\\gs*\\bin\\gswin64c.exe') as $file) {
                    $candidates[] = $file;
                }
                foreach (glob($root.'\\gs\\gs*\\bin\\gswin32c.exe') as $file) {
                    $candidates[] = $file;
                }
            }
        }

        foreach (array_unique($candidates) as $candidate) {
            if ($candidate === '') {
                continue;
            }
            $output = array();
            $returnCode = 0;
            exec(escapeshellarg($candidate).' --version 2>&1', $output, $returnCode);
            if ($returnCode === 0 && !empty($output)) {
                self::$ghostscriptBinary = $candidate;

                return $candidate;
            }
        }

        return null;
    }

    public static function isgsInstalled() {
        $binary = self::findGhostscript();
        if (!$binary) {
            return array(false);
        }

        $output = array();
        $returnCode = 0;
        exec(escapeshellarg($binary).' --version 2>&1', $output, $returnCode);

        return $returnCode === 0 && !empty($output) ? array(trim($output[0])) : array(false);
    }
}
