<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Unit;

use OCA\PhotoEditor\Service\PhotocraftBundleService;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Tests for the vendored bundle reader.
 *
 * The service takes a bundle root, so the tests point it at a small fixture
 * tree instead of the real 15 MB bundle.
 *
 * @covers \OCA\PhotoEditor\Service\PhotocraftBundleService
 */
class PhotocraftBundleServiceTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/photocraft-bundle-' . bin2hex(random_bytes(6));
        mkdir($this->root . '/app', 0o777, true);
        file_put_contents($this->root . '/index.html', '<!doctype html>');
        file_put_contents($this->root . '/app/photocraft-web.js', 'export {}');
        file_put_contents($this->root . '/app/photocraft-web.part-aa', 'gzip-bytes');
        file_put_contents($this->root . '/photocraft-web-boot_bg.wasm', 'wasm-bytes');

        // A file outside the bundle, to prove a traversal cannot reach it.
        file_put_contents(dirname($this->root) . '/outside-secret.txt', 'secret');
    }

    protected function tearDown(): void
    {
        $this->removeDirectory($this->root);
        @unlink(dirname($this->root) . '/outside-secret.txt');
    }

    private function service(): PhotocraftBundleService
    {
        return new PhotocraftBundleService($this->root);
    }

    public function testReportsTheBundleAsInstalled(): void
    {
        $this->assertTrue($this->service()->isInstalled());
    }

    public function testReportsAMissingBundleAsNotInstalled(): void
    {
        $service = new PhotocraftBundleService($this->root . '/does-not-exist');

        $this->assertFalse($service->isInstalled());
    }

    public function testResolvesAFileInTheBundle(): void
    {
        $resolved = $this->service()->resolve('app/photocraft-web.js');

        $this->assertSame($this->root . '/app/photocraft-web.js', $resolved);
    }

    public function testResolvesTheRootToIndexHtml(): void
    {
        $this->assertSame($this->root . '/index.html', $this->service()->resolve(''));
    }

    public function testRejectsAMissingFile(): void
    {
        $this->expectException(NotFoundException::class);

        $this->service()->resolve('app/missing.js');
    }

    /**
     * @return array<string, array{string}>
     */
    public static function traversalPaths(): array
    {
        return [
            'parent' => ['../outside-secret.txt'],
            'nested parent' => ['app/../../outside-secret.txt'],
            'parent with slash' => ['app/..'],
            'current directory' => ['./index.html'],
            'absolute' => ['/etc/passwd'],
            'null byte' => ["app/photocraft-web.js\0.png"],
            'backslash parent' => ['app\\..\\..\\outside-secret.txt'],
        ];
    }

    /**
     * A traversal attempt must fail rather than resolve to another file.
     */
    #[DataProvider('traversalPaths')]
    public function testRejectsTraversal(string $path): void
    {
        $this->expectException(NotFoundException::class);

        $this->service()->resolve($path);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function contentTypes(): array
    {
        return [
            // The module must be served as application/wasm or the browser
            // refuses to stream-compile it.
            'wasm' => ['boot_bg.wasm', 'application/wasm'],
            'html' => ['index.html', 'text/html; charset=utf-8'],
            'js' => ['app/photocraft-web.js', 'text/javascript; charset=utf-8'],
            'txt' => ['app/parts.txt', 'text/plain; charset=utf-8'],
            // The gzip parts are already compressed and must not be labelled,
            // so they fall through to octet-stream.
            'gzip part' => ['app/photocraft-web.part-aa', 'application/octet-stream'],
            'unknown' => ['app/data.bin', 'application/octet-stream'],
        ];
    }

    #[DataProvider('contentTypes')]
    public function testMapsContentTypes(string $path, string $expected): void
    {
        $this->assertSame($expected, $this->service()->contentTypeFor($path));
    }

    private function removeDirectory(string $directory): void
    {
        if (!is_dir($directory)) {
            return;
        }

        foreach (scandir($directory) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $path = $directory . '/' . $entry;
            is_dir($path) ? $this->removeDirectory($path) : @unlink($path);
        }

        @rmdir($directory);
    }
}
