<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Service;

use OCP\Files\NotFoundException;

/**
 * Reads the vendored PhotoCraft web build.
 *
 * PhotoCraft is a third-party Rust/WASM application that this app embeds. Its
 * web build is a static site (HTML, JS, WASM, gzip parts) that
 * `scripts/fetch-photocraft.sh` downloads into `<app>/photocraft` at a pinned
 * version, so the tree is generated rather than committed - the same way the
 * webpack output under `js/` is.
 *
 * It is served through a controller rather than by relying on the web server to
 * expose `<app>/photocraft` directly: that keeps the app portable across server
 * configurations and lets the response set `application/wasm`, which a browser
 * requires before it will stream-compile the module.
 */
class PhotocraftBundleService
{
    /** Directory that holds the bundle, relative to the app root. */
    private const BUNDLE_DIR = 'photocraft';

    /**
     * Content types for the bundle's extensions.
     *
     * `.wasm` must be `application/wasm`. The `.part-*` files are gzip already
     * and are served as-is, so they fall through to
     * `application/octet-stream` and must not carry `Content-Encoding`.
     */
    private const CONTENT_TYPES = [
        'html' => 'text/html; charset=utf-8',
        'js' => 'text/javascript; charset=utf-8',
        'mjs' => 'text/javascript; charset=utf-8',
        'wasm' => 'application/wasm',
        'css' => 'text/css; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'txt' => 'text/plain; charset=utf-8',
        'map' => 'application/json; charset=utf-8',
        'ttf' => 'font/ttf',
        'otf' => 'font/otf',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
    ];

    /** Default for anything unlisted, including the `.part-*` gzip parts. */
    private const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

    private readonly string $bundleRoot;

    public function __construct(?string $bundleRoot = null)
    {
        $this->bundleRoot = $bundleRoot ?? dirname(__DIR__, 2) . '/' . self::BUNDLE_DIR;
    }

    /**
     * Whether the bundle has been fetched.
     */
    public function isInstalled(): bool
    {
        return is_file($this->bundleRoot . '/index.html');
    }

    /**
     * Absolute path of a file in the bundle.
     *
     * @param string $path Relative path inside the bundle, e.g. `app/parts.txt`.
     * @throws NotFoundException when the path is missing or escapes the bundle.
     */
    public function resolve(string $path): string
    {
        $absolute = $this->bundleRoot . '/' . $this->normalise($path);

        if (!is_file($absolute)) {
            throw new NotFoundException('Not found');
        }

        return $absolute;
    }

    /**
     * Content type for a bundle path, by extension.
     */
    public function contentTypeFor(string $path): string
    {
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        return self::CONTENT_TYPES[$extension] ?? self::DEFAULT_CONTENT_TYPE;
    }

    /**
     * Reduce a request path to a safe relative path inside the bundle.
     *
     * Empty segments, `.` and `..` are refused rather than collapsed, so a
     * traversal attempt fails instead of quietly resolving to another file. A
     * request for the bundle root (or for nothing) maps to `index.html`.
     *
     * @throws NotFoundException
     */
    private function normalise(string $path): string
    {
        $path = str_replace('\\', '/', $path);

        $segments = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '') {
                continue;
            }
            if ($segment === '.' || $segment === '..' || str_contains($segment, "\0")) {
                throw new NotFoundException('Invalid path');
            }
            $segments[] = $segment;
        }

        return $segments === [] ? 'index.html' : implode('/', $segments);
    }
}
