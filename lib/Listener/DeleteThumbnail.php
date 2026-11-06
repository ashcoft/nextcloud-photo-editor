<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Listener;

use OCA\PhotoEditor\AppInfo\Application;
use OCA\PhotoEditor\Service\ThumbnailService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Events\Node\BeforeNodeDeletedEvent;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\File;
use OCP\Files\Folder;

/**
 * Removes cached thumbnails when the image they belong to is deleted.
 *
 * Without this the thumbnail cache would keep an image per deleted file
 * forever, since nothing else references the file id again.
 *
 * A folder deletion fires a single event for the folder, not for the images
 * inside it, so the folder case is handled from the *before* event while the
 * subtree can still be enumerated.
 *
 * @template-implements IEventListener<NodeDeletedEvent|BeforeNodeDeletedEvent>
 */
class DeleteThumbnail implements IEventListener
{
    public function __construct(
        private readonly ThumbnailService $thumbnailService,
    ) {
    }

    #[\Override]
    public function handle(Event $event): void
    {
        if ($event instanceof BeforeNodeDeletedEvent) {
            $node = $event->getNode();
            if ($node instanceof Folder) {
                $this->deleteFolderThumbnails($node);
            }
            return;
        }

        if (!$event instanceof NodeDeletedEvent) {
            return;
        }

        $node = $event->getNode();
        if (!$node instanceof File) {
            return;
        }

        // A file may have been renamed since its thumbnail was cached, so the
        // current extension cannot decide whether an image exists. Ask the
        // cache instead: the per-file layout makes this a single folder lookup
        // rather than a directory scan.
        $fileId = (int) $node->getId();
        if ($this->thumbnailService->hasThumbnail($fileId)) {
            $this->thumbnailService->deleteForFileId($fileId);
        }
    }

    /**
     * Remove the thumbnails of every supported image inside a folder being
     * deleted.
     */
    private function deleteFolderThumbnails(Folder $folder): void
    {
        try {
            foreach ($folder->searchByMime('image') as $node) {
                if ($node instanceof File && Application::isSupportedFile($node->getName())) {
                    $this->thumbnailService->deleteForFileId((int) $node->getId());
                }
            }
            foreach ($folder->searchByMime('application') as $node) {
                if ($node instanceof File && Application::isSupportedFile($node->getName())) {
                    $this->thumbnailService->deleteForFileId((int) $node->getId());
                }
            }
        } catch (\Throwable) {
            // A folder we cannot enumerate is not worth failing the deletion
            // over; the orphaned thumbnails are only a small cache.
        }
    }
}
