<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\AppInfo;

use OCA\PhotoEditor\Listener\DeleteThumbnail;
use OCA\PhotoEditor\Listener\LoadEditor;
use OCA\PhotoEditor\Preview\PhotoPreviewProvider;
use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\Files\Events\Node\BeforeNodeDeletedEvent;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\IMimeTypeDetector;

class Application extends App implements IBootstrap
{
    public const APP_ID = 'photo_editor';

    /**
     * Canonical MIME type for Photoshop PSD documents.
     *
     * Nextcloud resolves the many PSD aliases below to this type through the
     * app's mimetypealiases.json.
     */
    public const CANONICAL_PSD_MIME = 'image/vnd.adobe.photoshop';

    /**
     * Canonical MIME type for large Photoshop documents (PSB).
     */
    public const CANONICAL_PSB_MIME = 'image/vnd.adobe.photoshop-large';

    /**
     * Raster formats the editor can open.
     *
     * PSD/PSB are listed separately: they can be opened and composited but a
     * save writes a flattened raster export rather than a layered document,
     * because the editor does not re-encode the layer stack yet.
     */
    public const EDITABLE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'];

    /**
     * Formats the editor can write back.
     *
     * A browser canvas only encodes PNG and JPEG reliably; GIF, BMP and AVIF
     * fall back to PNG bytes, which would be written into a file still named
     * `.gif`. Those formats are opened read-only and offered through Export.
     */
    public const SAVEABLE_EXTENSIONS = ['png', 'jpg', 'jpeg'];

    public const PSD_EXTENSIONS = ['psd', 'psb'];

    /**
     * Largest image the editor loads, in bytes.
     *
     * Shared by the API that streams files and the start page, so a listed
     * image is always one the editor will open.
     */
    public const MAX_FILE_SIZE = 50 * 1024 * 1024;

    /**
     * Every MIME type that maps to a Photoshop document.
     */
    public const PSD_MIME_TYPES = [
        'image/vnd.adobe.photoshop',
        'image/x-photoshop',
        'image/photoshop',
        'image/psd',
        'image/x-psd',
        'application/x-photoshop',
        'image/vnd.adobe.photoshop-large',
        'image/psb',
        'image/x-psb',
    ];

    public function __construct()
    {
        parent::__construct(self::APP_ID);
    }

    #[\Override]
    public function register(IRegistrationContext $context): void
    {
        // Inject the file action / init script on the Files app and on the
        // app's own pages. Public share pages are skipped: the editor and its
        // file API require a logged-in user.
        $context->registerEventListener(LoadAdditionalScriptsEvent::class, LoadEditor::class);
        $context->registerEventListener(
            BeforeTemplateRenderedEvent::class,
            LoadEditor::class
        );

        // Serve thumbnails the browser editor has rendered and uploaded.
        $context->registerPreviewProvider(
            PhotoPreviewProvider::class,
            PhotoPreviewProvider::MIME_TYPE_REGEX
        );

        // Drop cached thumbnails when their image is deleted. The "before"
        // event is also handled, because a folder deletion reports only the
        // folder itself and the images inside it must be found first.
        $context->registerEventListener(NodeDeletedEvent::class, DeleteThumbnail::class);
        $context->registerEventListener(BeforeNodeDeletedEvent::class, DeleteThumbnail::class);
    }

    #[\Override]
    public function boot(IBootContext $context): void
    {
        // The repair step writes the mappings to the config files; this covers
        // setups where the config directory is not writable.
        $context->injectFn(function (IMimeTypeDetector $detector): void {
            if (!method_exists($detector, 'registerType')) {
                return;
            }
            // getAllMappings() must be called first: it forces the detector to
            // load the default mappings, which would otherwise be skipped
            // because registerType() marks the mapping table as initialized.
            $detector->getAllMappings();
            $detector->registerType('psd', self::CANONICAL_PSD_MIME);
            $detector->registerType('psb', self::CANONICAL_PSB_MIME);
        });
    }

    /**
     * Whether a file name is a Photoshop document.
     */
    public static function isPsdFile(string $fileName): bool
    {
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

        return in_array($extension, self::PSD_EXTENSIONS, true);
    }

    /**
     * Whether a file name is a raster format the editor can write back.
     */
    public static function isEditableFile(string $fileName): bool
    {
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

        return in_array($extension, self::EDITABLE_EXTENSIONS, true);
    }

    /**
     * Whether a file name is a raster format the editor can write back.
     *
     * Only PNG and JPEG: a browser canvas encodes those reliably, and the
     * other formats it decodes would otherwise be overwritten with PNG bytes
     * under their original extension.
     */
    public static function isSaveableFile(string $fileName): bool
    {
        $extension = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

        return in_array($extension, self::SAVEABLE_EXTENSIONS, true);
    }

    /**
     * Whether a file name is one the editor can open at all.
     */
    public static function isSupportedFile(string $fileName): bool
    {
        return self::isPsdFile($fileName) || self::isEditableFile($fileName);
    }
}
