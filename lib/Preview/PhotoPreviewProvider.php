<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Preview;

use OCA\PhotoEditor\Config\AppConfig;
use OCA\PhotoEditor\Service\ThumbnailService;
use OCP\Files\File;
use OCP\Files\FileInfo;
use OCP\IImage;
use OCP\Image;
use OCP\Preview\IProviderV2;

/**
 * Serves image previews from thumbnails rendered by the browser editor.
 *
 * PSD files have no server-side renderer, so the provider only returns a
 * cached thumbnail once the editor has uploaded one. Until then
 * `isAvailable()` reports false so Nextcloud keeps showing the generic file
 * icon and never caches a failed preview attempt.
 *
 * Raster formats keep using Nextcloud's own preview providers; this one only
 * answers for the Photoshop MIME types.
 */
class PhotoPreviewProvider implements IProviderV2
{
    /**
     * Matches every Photoshop MIME type the editor supports.
     *
     * Anchored so a MIME type merely *starting* with one (for example
     * `image/vnd.adobe.photoshopx`) is not treated as a PSD. Nextcloud matches
     * this with `preg_match`, so an unanchored pattern would over-match.
     */
    public const MIME_TYPE_REGEX = '~^(?:image/(?:vnd\.adobe\.photoshop(?:-large)?'
        . '|x-photoshop|photoshop|psd|x-psd|psb|x-psb)|application/x-photoshop)$~';

    public function __construct(
        private readonly ThumbnailService $thumbnailService,
        private readonly AppConfig $appConfig,
    ) {
    }

    #[\Override]
    public function getMimeType(): string
    {
        return self::MIME_TYPE_REGEX;
    }

    #[\Override]
    public function isAvailable(FileInfo $file): bool
    {
        if ($this->appConfig->getPreviews() !== 'yes') {
            return false;
        }

        return $file instanceof File && $this->thumbnailService->getThumbnail($file) !== null;
    }

    /**
     * The stored image is scaled down to the requested size before it reaches
     * Nextcloud's preview pipeline.
     */
    #[\Override]
    public function getThumbnail(File $file, int $maxX, int $maxY): ?IImage
    {
        if ($this->appConfig->getPreviews() !== 'yes') {
            return null;
        }

        $thumbnail = $this->thumbnailService->getThumbnail($file);
        if ($thumbnail === null) {
            return null;
        }

        return $this->loadImage($thumbnail->getContent(), $maxX, $maxY);
    }

    /**
     * Decode PNG bytes into an image, or null when they cannot be read.
     *
     * @psalm-suppress MissingDependency OCP\Image extends the private OC\Image, which the OCP stub omits.
     */
    private function loadImage(string $content, int $maxX, int $maxY): ?IImage
    {
        $image = new Image();
        if ($image->loadFromData($content) === false) {
            return null;
        }

        if ($maxX > 0 && $maxY > 0 && ($image->width() > $maxX || $image->height() > $maxY)) {
            $image->scaleDownToFit($maxX, $maxY);
        }

        return $image;
    }
}
