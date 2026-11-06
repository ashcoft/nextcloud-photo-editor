<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Unit;

use OCA\PhotoEditor\Service\ThumbnailService;
use OCA\PhotoEditor\Tests\Fixtures\InMemorySimpleRoot;
use OCP\Files\AppData\IAppDataFactory;
use OCP\Files\File;
use PHPUnit\Framework\Attributes\AllowMockObjectsWithoutExpectations;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Test suite for the thumbnail store.
 *
 * The service is exercised against an in-memory app-data tree, so a stored
 * thumbnail is one that can actually be read back.
 *
 * @covers \OCA\PhotoEditor\Service\ThumbnailService
 */
#[AllowMockObjectsWithoutExpectations]
class ThumbnailServiceTest extends TestCase
{
    private InMemorySimpleRoot $root;

    protected function setUp(): void
    {
        parent::setUp();
        $this->root = new InMemorySimpleRoot();
    }

    private function service(): ThumbnailService
    {
        $factory = $this->createMock(IAppDataFactory::class);
        $factory->method('get')->willReturn($this->root);

        return new ThumbnailService($factory, $this->createMock(LoggerInterface::class));
    }

    private function file(int $id, string $etag, string $name = 'photo.png'): File
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn($id);
        $file->method('getEtag')->willReturn($etag);
        $file->method('getName')->willReturn($name);

        return $file;
    }

    /** A valid 1x1 PNG. */
    private function png(): string
    {
        return base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            true,
        );
    }

    private function dataUrl(string $binary): string
    {
        return 'data:image/png;base64,' . base64_encode($binary);
    }

    public function testStoresAndReadsBackAThumbnail(): void
    {
        $service = $this->service();
        $file = $this->file(7, 'etag-1');

        $result = $service->storeThumbnail($file, $this->png(), 'etag-1');

        $this->assertSame(ThumbnailService::STORED, $result);
        $this->assertNotNull($service->getThumbnail($file));
    }

    public function testRejectsAStaleUpload(): void
    {
        $service = $this->service();
        $file = $this->file(7, 'etag-2');

        $result = $service->storeThumbnail($file, $this->png(), 'etag-1');

        $this->assertSame(ThumbnailService::STALE, $result);
        $this->assertNull($service->getThumbnail($file));
    }

    public function testARepeatedUploadIsIdempotent(): void
    {
        $service = $this->service();
        $file = $this->file(7, 'etag-1');

        $service->storeThumbnail($file, $this->png(), 'etag-1');
        $second = $service->storeThumbnail($file, $this->png(), 'etag-1');

        $this->assertSame(ThumbnailService::STORED, $second);
    }

    public function testANewEtagReplacesTheOldThumbnail(): void
    {
        $service = $this->service();
        $service->storeThumbnail($this->file(7, 'etag-1'), $this->png(), 'etag-1');
        $service->storeThumbnail($this->file(7, 'etag-2'), $this->png(), 'etag-2');

        $listing = $this->root->getFolder('thumbnails')->getFolder('7')->getDirectoryListing();
        $this->assertCount(1, $listing);
        $this->assertSame('etag-2.png', $listing[0]->getName());
    }

    public function testDeleteForFileIdRemovesTheThumbnails(): void
    {
        $service = $this->service();
        $service->storeThumbnail($this->file(7, 'etag-1'), $this->png(), 'etag-1');

        $service->deleteForFileId(7);

        $this->assertFalse($service->hasThumbnail(7));
    }

    public function testHasThumbnailIsFalseBeforeAnyUpload(): void
    {
        $this->assertFalse($this->service()->hasThumbnail(99));
    }

    public function testDecodesAValidPngDataUrl(): void
    {
        $decoded = $this->service()->decodePngDataUrl($this->dataUrl($this->png()));

        $this->assertIsArray($decoded);
        $this->assertSame('image/png', $decoded['mimeType']);
    }

    public function testRejectsANonPngDataUrl(): void
    {
        $this->assertNull($this->service()->decodePngDataUrl('data:image/jpeg;base64,AAAA'));
    }

    public function testRejectsBytesThatAreNotAPng(): void
    {
        $this->assertNull($this->service()->decodePngDataUrl('data:image/png;base64,QUJD'));
    }

    public function testRejectsAMalformedDataUrl(): void
    {
        $this->assertNull($this->service()->decodePngDataUrl('not-a-data-url'));
    }
}
