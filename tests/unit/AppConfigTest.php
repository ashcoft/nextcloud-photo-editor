<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Unit;

use OCA\PhotoEditor\Config\AppConfig;
use OCA\PhotoEditor\Tests\Fixtures\InMemoryAppConfig;
use PHPUnit\Framework\Attributes\AllowMockObjectsWithoutExpectations;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Test suite for the app-wide editor settings.
 *
 * @covers \OCA\PhotoEditor\Config\AppConfig
 */
#[AllowMockObjectsWithoutExpectations]
class AppConfigTest extends TestCase
{
    private function config(?InMemoryAppConfig $store = null): AppConfig
    {
        return new AppConfig(
            $store ?? new InMemoryAppConfig(),
            $this->createMock(LoggerInterface::class),
        );
    }

    public function testDefaults(): void
    {
        $config = $this->config();

        $this->assertSame('light', $config->getTheme());
        $this->assertSame('yes', $config->getPreviews());
        $this->assertSame(50 * 1024 * 1024, $config->getMaxFileSize());
    }

    public function testThemeRoundTrips(): void
    {
        $config = $this->config();
        $config->setTheme('dark');

        $this->assertSame('dark', $config->getTheme());
    }

    public function testThemeRejectsAnUnknownValue(): void
    {
        $config = $this->config();
        $config->setTheme('neon');

        $this->assertSame('light', $config->getTheme());
    }

    public function testPreviewsRoundTrip(): void
    {
        $config = $this->config();
        $config->setPreviews('no');

        $this->assertSame('no', $config->getPreviews());
    }

    public function testMaxFileSizeRoundTrips(): void
    {
        $config = $this->config();
        $config->setMaxFileSizeMb('128');

        $this->assertSame(128 * 1024 * 1024, $config->getMaxFileSize());
    }

    public function testMaxFileSizeRejectsOutOfRangeValues(): void
    {
        $config = $this->config();

        $config->setMaxFileSizeMb('0');
        $this->assertSame(50 * 1024 * 1024, $config->getMaxFileSize());

        $config->setMaxFileSizeMb('99999');
        $this->assertSame(50 * 1024 * 1024, $config->getMaxFileSize());
    }

    public function testCorruptStoredThemeFallsBackToTheDefault(): void
    {
        $store = new InMemoryAppConfig();
        $store->setAppValue('Theme', 'chartreuse');

        $this->assertSame('light', $this->config($store)->getTheme());
    }
}
