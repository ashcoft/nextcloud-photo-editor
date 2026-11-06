<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Fixtures;

use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFolder;
use OCP\Files\IAppData;

/**
 * An in-memory ISimpleRoot, so the ThumbnailService can be exercised without a
 * real Nextcloud data directory.
 */
class InMemorySimpleRoot implements IAppData
{
    /** @var array<string, InMemorySimpleFolder> */
    public array $folders = [];

    public function getFolder(string $name): ISimpleFolder
    {
        if (!isset($this->folders[$name])) {
            throw new NotFoundException($name);
        }

        return $this->folders[$name];
    }

    public function getDirectoryListing(): array
    {
        return array_values($this->folders);
    }

    public function newFolder(string $name): ISimpleFolder
    {
        return $this->folders[$name] ??= new InMemorySimpleFolder($name);
    }
}
