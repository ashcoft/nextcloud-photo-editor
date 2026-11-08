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
            static fn (File $f): bool => $f->isUpdateable(),
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

    /**
     * A structurally valid PSD or PSB as a data URL, with a 2x2 raw image.
     *
     * The header, the three length-prefixed sections and the image-data
     * compression tag are what the save path validates, so the fixture has to
     * be a real document rather than a header alone. PSB widens the layer and
     * mask length to 8 bytes - the other two sections stay 4 - so the fixture
     * has to follow the version it declares, or it would not be a document any
     * reader accepts.
     */
    private function psdDataUrl(int $width = 2, int $height = 2, int $version = 1): string
    {
        $header = '8BPS' . pack('n', $version) . str_repeat("\0", 6)
            . pack('n', 3) . pack('N', $height) . pack('N', $width) . pack('n', 8) . pack('n', 3);

        $colourMode = pack('N', 0);
        $resources = pack('N', 0);
        $layerAndMask = $version === 2
            ? pack('N', 0) . pack('N', 0)  // 8-byte PSB length
            : pack('N', 0);

        $body = $colourMode . $resources . $layerAndMask . pack('n', 0)
            . str_repeat("\xff", $width * $height * 3);

        return 'data:image/vnd.adobe.photoshop;base64,' . base64_encode($header . $body);
    }

    public function testSavesAValidPhotoshopDocument(): void
    {
        // The document must actually be written, and as Photoshop bytes.
        $locked = $this->imageFile(['etag-a', 'etag-b'], 'art.psd');
        $locked->expects($this->once())
            ->method('putContent')
            ->with($this->callback(
                static fn (string $binary): bool => str_starts_with($binary, '8BPS'),
            ));

        $controller = $this->controller(
            $this->imageFile(['etag-a'], 'art.psd'),
            ['image' => $this->psdDataUrl(), 'etag' => 'etag-a'],
            lockedFile: $locked,
        );

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_OK, $response->getStatus());
    }

    public function testSavesAValidPsbForAPsbFile(): void
    {
        $controller = $this->controller(
            $this->imageFile(['etag-a'], 'art.psb'),
            ['image' => $this->psdDataUrl(version: 2), 'etag' => 'etag-a'],
            lockedFile: $this->imageFile(['etag-a', 'etag-b'], 'art.psb'),
        );

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_OK, $response->getStatus());
    }

    public function testRefusesAPsdWrittenToAPsbFile(): void
    {
        // The version has to match the extension, or the file would be read
        // back as the wrong format.
        $controller = $this->controller(
            $this->imageFile(['etag-a'], 'art.psb'),
            ['image' => $this->psdDataUrl(version: 1), 'etag' => 'etag-a'],
            lockedFile: $this->imageFile(['etag-a', 'etag-b'], 'art.psb'),
        );

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
    }

    public function testRefusesATruncatedPhotoshopDocument(): void
    {
        // A header-only document passes the field checks but describes sections
        // that are not there, so it must not replace the original.
        $full = base64_decode(substr($this->psdDataUrl(), strlen('data:image/vnd.adobe.photoshop;base64,')));
        $truncated = substr($full, 0, 40);

        $controller = $this->controller(
            $this->imageFile(['etag-a'], 'art.psd'),
            ['image' => 'data:image/vnd.adobe.photoshop;base64,' . base64_encode($truncated), 'etag' => 'etag-a'],
            lockedFile: $this->imageFile(['etag-a', 'etag-b'], 'art.psd'),
        );

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
    }

    public function testRefusesAPhotoshopDocumentLargerThanTheEdgeCap(): void
    {
        $controller = $this->controller(
            $this->imageFile(['etag-a'], 'art.psd'),
            ['image' => $this->psdDataUrl(20000, 1), 'etag' => 'etag-a'],
            lockedFile: $this->imageFile(['etag-a', 'etag-b'], 'art.psd'),
        );

        $response = $controller->save(42);

        $this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
    }
}
