<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Stubs for private Nextcloud server classes used by this app. There is no
 * OCP API for these yet (https://github.com/nextcloud/server/issues/9192), so
 * the MIME registration writes to the config directory directly. Used by
 * PHPStan and Psalm only; never loaded at runtime.
 */

declare(strict_types=1);

namespace {
    class OC
    {
        /** @var string */
        public static $configDir = '';
    }
}

namespace OC\Hooks {
    interface Emitter
    {
    }
}

namespace OC {
    /**
     * The private base class OCP\Image extends. Only the members the app calls
     * are declared; Psalm needs the class to exist to resolve OCP\Image's
     * inheritance.
     */
    class Image
    {
        public function loadFromData(string $str): bool
        {
            return false;
        }

        public function width(): int
        {
            return 0;
        }

        public function height(): int
        {
            return 0;
        }

        public function scaleDownToFit(int $maxWidth, int $maxHeight): bool
        {
            return false;
        }
    }
}
