<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Settings;

use OCP\IL10N;
use OCP\IURLGenerator;
use OCP\Settings\IIconSection;

class AdminSection implements IIconSection
{
    public function __construct(
        private readonly IURLGenerator $url,
        private readonly IL10N $l10n,
    ) {
    }

    #[\Override]
    public function getID(): string
    {
        return 'photo_editor';
    }

    #[\Override]
    public function getName(): string
    {
        return $this->l10n->t('Photo Editor');
    }

    #[\Override]
    public function getPriority(): int
    {
        return 76;
    }

    #[\Override]
    public function getIcon(): string
    {
        return $this->url->imagePath('photo_editor', 'app.svg');
    }
}
