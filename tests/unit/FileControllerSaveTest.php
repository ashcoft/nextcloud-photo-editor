<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Unit;

use OCA\PhotoEditor\Config\AppConfig;
use OCA\PhotoEditor\Controller\FileController;
use OCA\PhotoEditor\Service\FileService;
use OCA\PhotoEditor\Service\ThumbnailService;
use OCA\PhotoEditor\Tests\Fixtures\InMemoryAppConfig;
use OCP\AppFramework\Http;
use OCP\Files\File;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\Attributes\AllowMockObjectsWithoutExpectations;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Test suite for the save endpoint of the FileController.
 *
 * The controller is exercised for real; only its collaborators are doubled.
 *
 * @covers \OCA\PhotoEditor\Controller\FileController
 */
#[AllowMockObjectsWithoutExpectations]
class FileControllerSaveTest extends TestCase
{
    /** A valid 1x1 PNG as a data URL. */
    private function pngDataUrl(): string
    {
        return 'data:image/png;base64,'
            . 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    }

    /**
     * Build a controller whose file lookup resolves to $file.
     *
     * `$lockedFile` is returned by the second lookup, the one made under the
     * lock. Supplying a different object is what lets a test prove the version
     * is re-read after the lock rather than taken from the first lookup.
     *
     * @param array<string, mixed> $params Request parameters.
     */
    private function controller(
        File $file,
        array $params = [],
        ?ILockingProvider $locking = null,
        ?File $lockedFile = null,
    ): FileController {
        $fileService = $this->createMock(FileService::class);
        $fileService->method('resolveFile')->willReturnOnConsecutiveCalls(
            ...($lockedFile === null ? [$file] : [$file, $lockedFile]),
        );
        $fileService->method('canSave')->willReturnCallback(
            static fn (File $f): bool => $f->isUpdateable()
                && !str_ends_with($f->getName(), '.psd')
                && !str_ends_with($f->getName(), '.psb'),
        );
        $fileService->method('exceedsMaxSize')->willReturn(false);
        $fileService->method('getMaxFileSize')->willReturn(50 * 1024 * 1024);

        $request = $this->createMock(IRequest::class);
        $request->method('getParam')->willReturnCallback(
            static fn (string $name, $default = null) => $params[$name] ?? $default,
        );

        return new FileController(
            'photo_editor',
            $request,
            $fileService,
            new AppConfig(new InMemoryAppConfig(), $this->createMock(LoggerInterface::class)),
            $this->createMock(ThumbnailService::class),
            $this->createMock(IURLGenerator::class),
            $this->createMock(LoggerInterface::class),
            $locking ?? $this->createMock(ILockingProvider::class),
        );
    }

    /**
     * An image file whose successive getEtag() calls return the given values.
     *
     * PHPUnit keeps the *first* stub registered for a method, so the sequence
     * is configured here in one place.
     *
     * @param list<string> $etags
     */
    private function imageFile(
        array $etags = ['etag-a'],
        string $name = 'photo.png',
        bool $updateable = true,
    ): File {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(42);
        $file->method('getName')->willReturn($name);
        $file->method('getSize')->willReturn(2048);
        $file->method('getMimeType')->willReturn('image/png');
        $file->method('getPath')->willReturn('/alice/files/pictures/' . $name);
        $file->method('isReadable')->willReturn(true);
        $file->method('isUpdateable')->willReturn($updateable);
        $file->method('getEtag')->willReturnOnConsecutiveCalls(...$etags);
        $file->method('getMTime')->willReturn(1700000000);

        return $file;
    }

    public function testSavesAndReturnsTheNewVersion(): void
    {
        // The file resolved under the lock reports the same version, so the
        // save proceeds and the new version comes back.
        $file = $this->imageFile(['etag-a']);
        $locked = $this->imageFile(['etag-a', 'etag-b']);

        // The edit must actually be persisted, not just reported.
        $locked->expects($this->once())
            ->method('putContent')
            ->with($this->callback(
                static fn (string $binary): bool => str_starts_with($binary, "\x89PNG\r\n\x1a\n"),
            ));

        $controller = $this->controller(
            $file,
            ['image' => $this->pngDataUrl(), 'etag' => 'etag-a'],
            lockedFile: $locked,
        );

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_OK, $response->getStatus());
        $this->assertSame('etag-b', $response->getData()['etag']);
    }

    public function testRefusesASaveWhenTheFileChanged(): void
    {
        // The under-lock lookup reports a newer version than the request's
        // etag, so the save must be refused rather than overwrite it.
        $file = $this->imageFile(['etag-a']);
        $locked = $this->imageFile(['etag-b']);
        $locked->expects($this->never())->method('putContent');

        $controller = $this->controller(
            $file,
            ['image' => $this->pngDataUrl(), 'etag' => 'etag-a'],
            lockedFile: $locked,
        );

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_CONFLICT, $response->getStatus());
    }

    public function testRefusesASaveWithoutAVersion(): void
    {
        $file = $this->imageFile();
        $controller = $this->controller($file, ['image' => $this->pngDataUrl()]);

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
    }

    public function testRefusesASaveWithoutImageData(): void
    {
        $file = $this->imageFile();
        $controller = $this->controller($file, ['etag' => 'etag-a']);

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
    }

    public function testRefusesInvalidImageData(): void
    {
        $file = $this->imageFile();
        $controller = $this->controller($file, [
            'image' => 'data:image/png;base64,QUJD',
            'etag' => 'etag-a',
        ]);

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
    }

    public function testRefusesAnUnsupportedDataUrlScheme(): void
    {
        $file = $this->imageFile();
        $controller = $this->controller($file, [
            'image' => 'data:image/tiff;base64,AAAA',
            'etag' => 'etag-a',
        ]);

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
    }

    /**
     * A tiny, solid-colour PNG can declare a canvas whose decoded bitmap would
     * exhaust the server's memory, so the pixel count is bounded before GD is
     * asked to allocate it.
     */
    public function testRefusesAnImageBeyondThePixelBudget(): void
    {
        // A 1x1 PNG whose IHDR claims 16384x16384: within the edge cap, but
        // 268M pixels.
        $png = base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            true,
        );
        $oversized = substr($png, 0, 16) . pack('N', 16384) . pack('N', 16384) . substr($png, 24);

        $file = $this->imageFile();
        $controller = $this->controller($file, [
            'image' => 'data:image/png;base64,' . base64_encode($oversized),
            'etag' => 'etag-a',
        ]);

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
    }

    public function testRefusesToSaveAReadOnlyFile(): void
    {
        $file = $this->imageFile(updateable: false);
        $controller = $this->controller($file, ['image' => $this->pngDataUrl(), 'etag' => 'etag-a']);

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_FORBIDDEN, $response->getStatus());
    }

    public function testRefusesToSaveAPsd(): void
    {
        $file = $this->imageFile(['etag-a'], 'art.psd');
        $controller = $this->controller($file, ['image' => $this->pngDataUrl(), 'etag' => 'etag-a']);

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_UNSUPPORTED_MEDIA_TYPE, $response->getStatus());
    }
}
