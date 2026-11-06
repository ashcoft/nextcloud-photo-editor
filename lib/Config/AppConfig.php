<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Config;

use OCP\AppFramework\Services\IAppConfig;
use Psr\Log\LoggerInterface;

/**
 * App-wide editor settings, read and written from the admin settings page.
 *
 * Only settings the editor actually honours are kept here: the theme it opens
 * with, whether previews may be rendered and stored, and the largest file it
 * will load.
 */
class AppConfig
{
    /** The app id, used when declaring the delegated settings scope. */
    public const APP_CONFIG_KEY = 'photo_editor';

    public const DEFAULT_THEME = 'light';
    public const DEFAULT_PREVIEWS = 'yes';
    public const DEFAULT_MAX_SIZE_MB = 50;

    public const THEMES = ['light', 'dark'];
    public const YES_NO = ['yes', 'no'];

    /** Bounds for the admin-configurable size limit. */
    public const MIN_MAX_SIZE_MB = 1;
    public const MAX_MAX_SIZE_MB = 512;

    private const KEY_THEME = 'Theme';
    private const KEY_PREVIEWS = 'Previews';
    private const KEY_MAX_SIZE_MB = 'MaxSizeMb';

    public function __construct(
        private readonly IAppConfig $config,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function getTheme(): string
    {
        return $this->read(self::KEY_THEME, self::THEMES, self::DEFAULT_THEME);
    }

    public function setTheme(string $theme): void
    {
        $this->store(self::KEY_THEME, 'SetTheme', $theme, self::THEMES, self::DEFAULT_THEME);
    }

    public function getPreviews(): string
    {
        return $this->read(self::KEY_PREVIEWS, self::YES_NO, self::DEFAULT_PREVIEWS);
    }

    public function setPreviews(string $previews): void
    {
        $this->store(self::KEY_PREVIEWS, 'SetPreviews', $previews, self::YES_NO, self::DEFAULT_PREVIEWS);
    }

    /**
     * The largest file the editor will load, in bytes.
     */
    public function getMaxFileSize(): int
    {
        $value = (int) $this->config->getAppValueString(
            self::KEY_MAX_SIZE_MB,
            (string) self::DEFAULT_MAX_SIZE_MB,
        );

        if ($value < self::MIN_MAX_SIZE_MB || $value > self::MAX_MAX_SIZE_MB) {
            return self::DEFAULT_MAX_SIZE_MB * 1024 * 1024;
        }

        return $value * 1024 * 1024;
    }

    public function setMaxFileSizeMb(string $megabytes): void
    {
        $value = (int) $megabytes;
        if ($value < self::MIN_MAX_SIZE_MB || $value > self::MAX_MAX_SIZE_MB) {
            $value = self::DEFAULT_MAX_SIZE_MB;
        }

        $this->config->setAppValueString(self::KEY_MAX_SIZE_MB, (string) $value);
    }

    /**
     * Read a setting, falling back to the default when the stored value is not
     * one of the allowed ones.
     *
     * @param string[] $allowed
     */
    private function read(string $key, array $allowed, string $default): string
    {
        return $this->normalize($this->config->getAppValueString($key), $allowed, $default);
    }

    /**
     * Write a setting, refusing a value outside the allowed set.
     *
     * The rejected value is logged so a misconfigured setting is visible in the
     * log rather than only as a setting that silently reverts.
     *
     * @param string[] $allowed
     */
    private function store(string $key, string $setter, string $value, array $allowed, string $default): void
    {
        $normalized = $this->normalize($value, $allowed, $default);
        if ($normalized !== $value) {
            $this->logger->info('Photo Editor: rejected an invalid setting value', [
                'setting' => $key,
                'value' => $value,
            ]);
        }

        $this->config->setAppValueString($key, $normalized);
    }

    /**
     * @param string[] $allowed
     */
    private function normalize(string $value, array $allowed, string $default): string
    {
        return in_array($value, $allowed, true) ? $value : $default;
    }
}
