<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Unit;

use OCA\PhotoEditor\Config\AppConfig;
use OCA\PhotoEditor\Service\FileService;
use OCA\PhotoEditor\Tests\Fixtures\InMemoryAppConfig;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\Attributes\AllowMockObjectsWithoutExpectations;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Test suite for file resolution and description.
 *
 * @covers \OCA\PhotoEditor\Service\FileService
 */
#[AllowMockObjectsWithoutExpectations]
class FileServiceTest extends TestCase
{
    /**
     * The class getUserFolder() is declared to return by the installed OCP.
     *
     * Read reflectively so the test works on Nextcloud 34/35 (which return a
     * Folder) and on newer versions (which return an IUserFolder).
     */
    private function userFolderType(): string
    {
        $type = (new \ReflectionMethod(IRootFolder::class, 'getUserFolder'))->getReturnType();

        return $type instanceof \ReflectionNamedType ? $type->getName() : Folder::class;
    }

    private function service(
        ?\OCP\Files\Node $file,
        ?InMemoryAppConfig $store = null,
        bool $withUser = true,
    ): FileService {
        $session = $this->createMock(IUserSession::class);
        if ($withUser) {
            $user = $this->createMock(IUser::class);
            $user->method('getUID')->willReturn('alice');
            $session->method('getUser')->willReturn($user);
        } else {
            $session->method('getUser')->willReturn(null);
        }

        $userFolder = $this->createMock($this->userFolderType());
        $userFolder->method('getById')->willReturn($file === null ? [] : [$file]);
        $userFolder->method('getRelativePath')->willReturnCallback(
            static fn (string $path) => str_starts_with($path, '/alice/files')
                ? substr($path, strlen('/alice/files'))
                : null,
        );

        $rootFolder = $this->createMock(IRootFolder::class);
        $rootFolder->method('getUserFolder')->willReturn($userFolder);

        return new FileService(
            $rootFolder,
            $session,
            new AppConfig($store ?? new InMemoryAppConfig(), $this->createMock(LoggerInterface::class)),
        );
    }

    /**
     * A file mock. Every stub is configured here in one call because PHPUnit
     * keeps the *first* stub registered for a method, so a later `->method()`
     * on the same mock would be silently ignored.
     */
    private function file(
        string $name = 'photo.png',
        string $path = '/alice/files/pictures/photo.png',
        bool $updateable = true,
        bool $readable = true,
        int $size = 2048,
    ): File {
        $parent = $this->createMock(Folder::class);
        $parent->method('getPath')->willReturn(dirname($path));

        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn(42);
        $file->method('getName')->willReturn($name);
        $file->method('getSize')->willReturn($size);
        $file->method('getMimeType')->willReturn('image/png');
        $file->method('getEtag')->willReturn('etag-a');
        $file->method('getPath')->willReturn($path);
        $file->method('getParent')->willReturn($parent);
        $file->method('isReadable')->willReturn($readable);
        $file->method('isUpdateable')->willReturn($updateable);

        return $file;
    }

    public function testResolvesAFile(): void
    {
        $file = $this->file();
        $this->assertSame($file, $this->service($file)->resolveFile(42));
    }

    public function testThrowsWhenTheFileIsMissing(): void
    {
        $this->expectException(NotFoundException::class);
        $this->service(null)->resolveFile(42);
    }

    public function testThrowsWhenThereIsNoUser(): void
    {
        $this->expectException(\RuntimeException::class);
        $this->service(null, withUser: false)->resolveFile(42);
    }

    public function testThrowsWhenTheIdNamesAFolder(): void
    {
        $folder = $this->createMock(Folder::class);
        $service = $this->service($folder);

        $this->expectException(\InvalidArgumentException::class);
        $service->resolveFile(42);
    }

    public function testThrowsWhenTheFileIsNotReadable(): void
    {
        $this->expectException(NotPermittedException::class);
        $this->service($this->file(readable: false))->resolveFile(42);
    }

    public function testDescribesAFile(): void
    {
        $description = $this->service($this->file())->describe($this->file());

        $this->assertSame(42, $description['id']);
        $this->assertSame('photo.png', $description['name']);
        $this->assertSame('/pictures', $description['directory']);
        $this->assertTrue($description['canSave']);
        $this->assertFalse($description['isPsd']);
    }

    public function testMarksAPsdAsSaveable(): void
    {
        $description = $this->service($this->file('art.psd'))->describe($this->file('art.psd'));

        $this->assertTrue($description['isPsd']);
        // PhotoCraft writes a layered PSD back, so a Photoshop document is no
        // longer read-only.
        $this->assertTrue($description['canSave']);
    }

    public function testMarksAnUnsupportedRasterAsNotSaveable(): void
    {
        // WEBP is opened but not written back: PhotoCraft exports it instead,
        // because a save would replace it with different bytes under the same
        // extension.
        $description = $this->service($this->file('art.webp'))->describe($this->file('art.webp'));

        $this->assertFalse($description['canSave']);
    }

    public function testMarksAReadOnlyImageAsNotSaveable(): void
    {
        $description = $this->service($this->file(updateable: false))
            ->describe($this->file(updateable: false));

        $this->assertFalse($description['canSave']);
    }

    public function testReportsWhenAFileExceedsTheLimit(): void
    {
        $store = new InMemoryAppConfig();
        $store->setAppValue('MaxSizeMb', '1');

        $service = $this->service($this->file(), $store);
        $file = $this->file(size: 2 * 1024 * 1024);

        $this->assertTrue($service->exceedsMaxSize($file));
    }

    public function testADirectoryInTheUserRootIsReportedAsRoot(): void
    {
        $file = $this->file('photo.png', '/alice/files/photo.png');
        $description = $this->service($file)->describe($file);

        $this->assertSame('/', $description['directory']);
    }
}
