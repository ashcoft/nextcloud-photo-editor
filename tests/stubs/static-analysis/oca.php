<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Stubs for OCA classes from other apps (files) that are not part of the
 * nextcloud/ocp package. Signatures mirror nextcloud/server stable35. Used by
 * PHPStan and Psalm only; never loaded at runtime.
 */

declare(strict_types=1);

namespace OCA\Files\Event {
    class LoadAdditionalScriptsEvent extends \OCP\EventDispatcher\Event
    {
    }
}
