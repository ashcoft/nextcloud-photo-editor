<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Settings;

use OCA\PhotoEditor\Config\AppConfig;
use OCA\PhotoEditor\Controller\AdminSettingsController;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\Settings\IDelegatedSettings;

/**
 * Delegated admin settings: the settings form is the app's own controller,
 * which is also what the admin settings route serves.
 *
 * Declaring it delegated (rather than building a second form here) keeps the
 * two entry points to the same settings identical, and lets the app's own
 * AuthorizedAdminSetting attribute govern who may post changes.
 */
class AdminSettings implements IDelegatedSettings
{
    public function __construct(
        private readonly AdminSettingsController $controller,
    ) {
    }

    #[\Override]
    public function getName(): ?string
    {
        return null;
    }

    #[\Override]
    public function getAuthorizedAppConfig(): array
    {
        // Only the keys this settings form writes are delegated. A wildcard
        // would let a delegated admin change every future app-config key.
        return [
            AppConfig::APP_CONFIG_KEY => [
                '^Theme$',
                '^Previews$',
                '^MaxSizeMb$',
            ],
        ];
    }

    #[\Override]
    public function getForm(): TemplateResponse
    {
        return $this->controller->index();
    }

    #[\Override]
    public function getSection(): string
    {
        return 'photo_editor';
    }

    #[\Override]
    public function getPriority(): int
    {
        return 76;
    }
}
