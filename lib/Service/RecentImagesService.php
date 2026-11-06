<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Service;

use OCA\PhotoEditor\AppInfo\Application;
use OCP\Files\File;
use OCP\Files\Folder;
use Psr\Log\LoggerInterface;

/**
 * Lists recently edited images for the start page.
 *
 * The list is built from the user's own folder, so it can only ever contain
 * files that user can already see.
 */
class RecentImagesService
{
    /** How many images the start page shows. */
    private const LIMIT = 24;

    public function __construct(
        private readonly FileService $fileService,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * @return list<array{id: int, name: string, path: string, extension: string, mtime: int, isPsd: bool}>
     */
    public function getRecentImages(): array
    {
        try {
            $folder = $this->fileService->getUserFolder();
        } catch (\Throwable) {
            return [];
        }

        $images = $this->collect($folder);
        if ($images === []) {
            return [];
        }

        usort(
            $images,
            static fn (array $a, array $b): int => $b['mtime'] <=> $a['mtime'],
        );

        return array_slice($images, 0, self::LIMIT);
    }

    /**
     * @return list<array{id: int, name: string, path: string, extension: string, mtime: int, isPsd: bool}>
     */
    private function collect(Folder $folder): array
    {
        $results = [];

        try {
            $nodes = $folder->searchByMime('image');
        } catch (\Throwable $e) {
            $this->logger->warning('Photo Editor: could not list images', [
                'exception' => $e,
            ]);
            return [];
        }

        foreach ($nodes as $node) {
            if (!$node instanceof File) {
                continue;
            }

            $entry = $this->describe($node, $folder);
            if ($entry !== null) {
                $results[] = $entry;
            }
        }

        return $results;
    }

    /**
     * @return array{id: int, name: string, path: string, extension: string, mtime: int, isPsd: bool}|null
     */
    private function describe(File $file, Folder $root): ?array
    {
        if (!Application::isSupportedFile($file->getName())) {
            return null;
        }

        $relative = $root->getRelativePath($file->getPath());
        if ($relative === null) {
            return null;
        }

        return [
            'id' => (int) $file->getId(),
            'name' => $file->getName(),
            'path' => '/' . ltrim($relative, '/'),
            'extension' => strtolower(pathinfo($file->getName(), PATHINFO_EXTENSION)),
            'mtime' => $file->getMTime(),
            'isPsd' => Application::isPsdFile($file->getName()),
        ];
    }
}
