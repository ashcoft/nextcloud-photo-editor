<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Fixtures;

use OCP\Files\NotFoundException;
use OCP\Files\SimpleFS\ISimpleFile;
use OCP\Files\SimpleFS\ISimpleFolder;

/**
 * An in-memory ISimpleFolder backed by arrays.
 */
class InMemorySimpleFolder implements ISimpleFolder
{
    /** @var array<string, InMemorySimpleFile> */
    public array $files = [];

    /** @var array<string, InMemorySimpleFolder> */
    public array $folders = [];

    public function __construct(private readonly string $name)
    {
    }

    public function getDirectoryListing(): array
    {
        return array_values($this->files);
    }

    public function fileExists(string $name): bool
    {
        return isset($this->files[$name]);
    }

    public function getFile(string $name): ISimpleFile
    {
        if (!isset($this->files[$name])) {
            throw new NotFoundException($name);
        }

        return $this->files[$name];
    }

    public function newFile(string $name, $content = null): ISimpleFile
    {
        $file = new InMemorySimpleFile($name, (string) $content);
        $file->setOnDelete(function (string $deleted): void {
            unset($this->files[$deleted]);
        });

        return $this->files[$name] = $file;
    }

    public function delete(): void
    {
        $this->files = [];
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getFolder(string $name): ISimpleFolder
    {
        if (!isset($this->folders[$name])) {
            throw new NotFoundException($name);
        }

        return $this->folders[$name];
    }

    public function newFolder(string $name): ISimpleFolder
    {
        $folder = $this->folders[$name] ??= new InMemorySimpleFolder($name);

        return $folder;
    }

    /**
     * Create each path component in turn.
     *
     * `$path` is a slash-separated path, so treating it as a single folder name
     * would make a nested lookup behave differently here than in production.
     */
    public function getOrCreateFolder(string $path, int $maxRetries = 5): ISimpleFolder
    {
        $folder = $this;

        foreach (explode('/', trim($path, '/')) as $segment) {
            if ($segment === '') {
                continue;
            }
            $folder = $folder->newFolder($segment);
        }

        return $folder;
    }
}
