<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Fixtures;

use OCP\Files\SimpleFS\ISimpleFile;

/**
 * An in-memory ISimpleFile, so a write can be read back.
 */
class InMemorySimpleFile implements ISimpleFile
{
    /** @var callable|null Invoked when the file is deleted, to detach it. */
    private $onDelete = null;

    public function __construct(
        private readonly string $name,
        private string $content,
        private readonly int $mtime = 0,
    ) {
    }

    public function setOnDelete(callable $onDelete): void
    {
        $this->onDelete = $onDelete;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getSize(): int|float
    {
        return strlen($this->content);
    }

    public function getETag(): string
    {
        return 'etag-' . $this->name;
    }

    public function getMTime(): int
    {
        return $this->mtime;
    }

    public function getContent(): string
    {
        return $this->content;
    }

    public function putContent($data): void
    {
        $this->content = (string) $data;
    }

    public function delete(): void
    {
        $this->content = '';

        if ($this->onDelete !== null) {
            ($this->onDelete)($this->name);
        }
    }

    public function getMimeType(): string
    {
        return 'image/png';
    }

    public function getExtension(): string
    {
        return 'png';
    }

    public function read()
    {
        $stream = fopen('php://memory', 'rb+');
        fwrite($stream, $this->content);
        rewind($stream);

        return $stream;
    }

    public function write()
    {
        return fopen('php://memory', 'wb');
    }
}
