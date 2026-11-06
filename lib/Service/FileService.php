<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Service;

use OCA\PhotoEditor\AppInfo\Application;
use OCA\PhotoEditor\Config\AppConfig;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IUserSession;

/**
 * Resolves and describes files for the editor.
 *
 * All access goes through the user's own folder, so a file id a user cannot
 * see is never returned, whatever the request says.
 */
class FileService
{
    public function __construct(
        private readonly IRootFolder $rootFolder,
        private readonly IUserSession $userSession,
        private readonly AppConfig $appConfig,
    ) {
    }

    /**
     * Resolve a file by id for the current user.
     *
     * @throws \RuntimeException when there is no user session.
     * @throws \OCP\Files\NotFoundException when the file is not visible.
     * @throws \OCP\Files\NotPermittedException when the file is not readable.
     * @throws \InvalidArgumentException when the id names a folder.
     */
    public function resolveFile(int $fileId): File
    {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new \RuntimeException('Unauthorized');
        }

        $userFolder = $this->rootFolder->getUserFolder($user->getUID());
        $files = $userFolder->getById($fileId);

        if (empty($files)) {
            throw new \OCP\Files\NotFoundException('File not found');
        }

        $file = $files[0];
        if (!$file instanceof File) {
            throw new \InvalidArgumentException('Not a file');
        }

        if (!$file->isReadable()) {
            throw new \OCP\Files\NotPermittedException('Access denied');
        }

        return $file;
    }

    /**
     * The user-visible folder the file lives in, for "back to Files" links.
     *
     * `Node::getPath()` returns the full storage path, which includes the
     * user's `files` mount segment (`/alice/files/pictures/cat.png`). Resolving
     * it against the user folder yields the folder as the Files app names it
     * (`/pictures`), including `/` for a file in the user's root.
     */
    public function getUserDirectory(File $file): string
    {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return '/';
        }

        try {
            $userFolder = $this->rootFolder->getUserFolder($user->getUID());
            $relative = $userFolder->getRelativePath($file->getParent()->getPath());
        } catch (\Throwable) {
            return '/';
        }

        if ($relative === null || $relative === '') {
            return '/';
        }

        return '/' . ltrim($relative, '/');
    }

    /**
     * Whether a save would be refused because the file is too large.
     */
    public function exceedsMaxSize(File $file): bool
    {
        return $file->getSize() > $this->appConfig->getMaxFileSize();
    }

    /**
     * The maximum accepted payload size, in bytes.
     */
    public function getMaxFileSize(): int
    {
        return $this->appConfig->getMaxFileSize();
    }

    /**
     * Whether the editor can write this file back.
     *
     * A PSD cannot be re-encoded, so a save of a PSD would silently flatten
     * the document. Such a file stays read-only in the editor and the client
     * offers an export instead.
     */
    public function canSave(File $file): bool
    {
        if (!$file->isUpdateable()) {
            return false;
        }

        return Application::isEditableFile($file->getName());
    }

    /**
     * Describe a file for the client.
     *
     * @return array{id: int, name: string, size: int, mimeType: string, path: string, directory: string, etag: string, canSave: bool, isPsd: bool}
     */
    public function describe(File $file): array
    {
        return [
            'id' => (int) $file->getId(),
            'name' => $file->getName(),
            'size' => (int) $file->getSize(),
            'mimeType' => $file->getMimeType(),
            'path' => $file->getPath(),
            'directory' => $this->getUserDirectory($file),
            'etag' => $file->getEtag(),
            'canSave' => $this->canSave($file),
            'isPsd' => Application::isPsdFile($file->getName()),
        ];
    }

    /**
     * The user folder of the current session.
     *
     * @throws \RuntimeException when there is no user session.
     */
    public function getUserFolder(): Folder
    {
        $user = $this->userSession->getUser();
        if ($user === null) {
            throw new \RuntimeException('Unauthorized');
        }

        return $this->rootFolder->getUserFolder($user->getUID());
    }
}
