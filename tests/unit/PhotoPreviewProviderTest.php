<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Unit;

use OCA\PhotoEditor\Config\AppConfig;
use OCA\PhotoEditor\Preview\PhotoPreviewProvider;
use OCA\PhotoEditor\Service\ThumbnailService;
use OCP\Files\File;
use OCP\Files\SimpleFS\ISimpleFile;
use PHPUnit\Framework\Attributes\AllowMockObjectsWithoutExpectations;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Test suite for the browser-rendered preview provider.
 *
 * The provider is the seam between a stored thumbnail and the Files grid, so
 * the cases that matter are the ones where it must decline rather than throw:
 * the preview pipeline turns a thrown error into a failed preview request,
 * whereas null leaves the generic file icon in place.
 *
 * @covers \OCA\PhotoEditor\Preview\PhotoPreviewProvider
 */
#[AllowMockObjectsWithoutExpectations]
class PhotoPreviewProviderTest extends TestCase
{
    /** A valid 1x1 PNG. */
    private function png(): string
    {
        return base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            true,
        );
    }

    private function provider(?ISimpleFile $thumbnail, string $previews = 'yes'): PhotoPreviewProvider
    {
        $service = $this->createMock(ThumbnailService::class);
        $service->method('getThumbnail')->willReturn($thumbnail);

        $config = $this->createMock(AppConfig::class);
        $config->method('getPreviews')->willReturn($previews);

        return new PhotoPreviewProvider($service, $config, $this->createMock(LoggerInterface::class));
    }

    private function file(): File
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(1);

        return $file;
    }

    private function thumbnail(string $content): ISimpleFile
    {
        $thumbnail = $this->createMock(ISimpleFile::class);
        $thumbnail->method('getContent')->willReturn($content);

        return $thumbnail;
    }

    public function testMimeTypeRegexMatchesThePhotoshopTypesOnly(): void
    {
        $regex = PhotoPreviewProvider::MIME_TYPE_REGEX;

        foreach (['image/vnd.adobe.photoshop', 'image/vnd.adobe.photoshop-large', 'image/psd'] as $mime) {
            $this->assertSame(1, preg_match($regex, $mime), $mime);
        }

        foreach (['image/png', 'image/jpeg', 'image/vnd.adobe.photoshopx'] as $mime) {
            $this->assertSame(0, preg_match($regex, $mime), $mime);
        }
    }

    public function testReturnsNullWhenNoThumbnailIsStored(): void
    {
        $this->assertNull($this->provider(null)->getThumbnail($this->file(), 32, 32));
    }

    public function testReturnsNullWhenPreviewsAreDisabled(): void
    {
        $provider = $this->provider($this->thumbnail($this->png()), 'no');

        $this->assertNull($provider->getThumbnail($this->file(), 32, 32));
    }

    /**
     * A read failure must not escape as an exception: the preview pipeline
     * would report a broken preview instead of falling back to the icon.
     */
    public function testReturnsNullWhenReadingTheThumbnailThrows(): void
    {
        $thumbnail = $this->createMock(ISimpleFile::class);
        $thumbnail->method('getContent')->willThrowException(new \RuntimeException('locked'));

        $this->assertNull($this->provider($thumbnail)->getThumbnail($this->file(), 32, 32));
    }

    /**
     * `isAvailable()` gates the provider before `getThumbnail()` is called, so
     * it must be false without a stored thumbnail and true with one.
     */
    public function testIsAvailableFollowsTheStoredThumbnail(): void
    {
        $this->assertFalse($this->provider(null)->isAvailable($this->file()));
        $this->assertTrue($this->provider($this->thumbnail($this->png()))->isAvailable($this->file()));
    }

    public function testIsNotAvailableWhenPreviewsAreDisabled(): void
    {
        $provider = $this->provider($this->thumbnail($this->png()), 'no');

        $this->assertFalse($provider->isAvailable($this->file()));
    }
}
