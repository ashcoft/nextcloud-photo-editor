<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * Minimal OC\* stubs for the classes the app touches that are not part of the
 * public OCP surface (which vendor-bin/nextcloud-ocp provides).
 *
 * Only what the tests exercise is defined; anything else is left to the real
 * autoloader so a test that reaches for something new fails loudly rather than
 * silently passing against a stub.
 */

declare(strict_types=1);

namespace {
    class OC
    {
        /** @var mixed */
        public static $server;

        /** @var string */
        public static $configDir = '/tmp';
    }
}

namespace OCP {
    /**
     * A no-op stand-in for Nextcloud's script registry.
     *
     * The real Util::addInitScript/addStyle reach into the server container,
     * which a unit test does not have. The listener only needs the calls to be
     * accepted; this stub records them so a test can assert on them.
     */
    class Util
    {
        /** @var list<array{0: string, 1: string, 2: string}> */
        public static array $calls = [];

        public static function addScript(string $appId, string $scriptName): void
        {
            self::$calls[] = ['script', $appId, $scriptName];
        }

        public static function addStyle(string $appId, string $styleName): void
        {
            self::$calls[] = ['style', $appId, $styleName];
        }

        public static function addInitScript(string $appId, string $scriptName): void
        {
            self::$calls[] = ['init', $appId, $scriptName];
        }

        public static function reset(): void
        {
            self::$calls = [];
        }
    }
}
