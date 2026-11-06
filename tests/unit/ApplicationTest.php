<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Unit;

use OCA\PhotoEditor\AppInfo\Application;
use OCA\PhotoEditor\Preview\PhotoPreviewProvider;
use PHPUnit\Framework\TestCase;

/**
 * Test suite for the Application bootstrap and its static helpers.
 *
 * @covers \OCA\PhotoEditor\AppInfo\Application
 */
class ApplicationTest extends TestCase
{
    public function testAppId(): void
    {
        $this->assertSame('photo_editor', Application::APP_ID);
    }

    public function testCanonicalMimeTypes(): void
    {
        $this->assertSame('image/vnd.adobe.photoshop', Application::CANONICAL_PSD_MIME);
        $this->assertSame('image/vnd.adobe.photoshop-large', Application::CANONICAL_PSB_MIME);
    }

    public function testIsPsdFile(): void
    {
        $this->assertTrue(Application::isPsdFile('art.psd'));
        $this->assertTrue(Application::isPsdFile('ART.PSB'));
        $this->assertFalse(Application::isPsdFile('photo.png'));
        $this->assertFalse(Application::isPsdFile('psd'));
    }

    public function testIsEditableFile(): void
    {
        $this->assertTrue(Application::isEditableFile('photo.png'));
        $this->assertTrue(Application::isEditableFile('photo.jpeg'));
        $this->assertTrue(Application::isEditableFile('photo.WEBP'));
        $this->assertFalse(Application::isEditableFile('art.psd'));
        $this->assertFalse(Application::isEditableFile('notes.txt'));
    }

    public function testIsSupportedFileCoversBothFamilies(): void
    {
        $this->assertTrue(Application::isSupportedFile('art.psd'));
        $this->assertTrue(Application::isSupportedFile('photo.png'));
        $this->assertFalse(Application::isSupportedFile('movie.mp4'));
    }

    public function testPreviewMimeRegexMatchesEveryPhotoshopAlias(): void
    {
        foreach (Application::PSD_MIME_TYPES as $mime) {
            $this->assertSame(
                1,
                preg_match(PhotoPreviewProvider::MIME_TYPE_REGEX, $mime),
                sprintf('The preview regex should match %s', $mime),
            );
        }
    }

    public function testPreviewMimeRegexIsAnchored(): void
    {
        // A type merely starting with a Photoshop one must not match.
        $this->assertSame(
            0,
            preg_match(PhotoPreviewProvider::MIME_TYPE_REGEX, 'image/vnd.adobe.photoshopx'),
        );
        $this->assertSame(0, preg_match(PhotoPreviewProvider::MIME_TYPE_REGEX, 'image/png'));
    }
}
