<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Controller;

use OCA\PhotoEditor\AppInfo\Application;
use OCA\PhotoEditor\Config\AppConfig;
use OCA\PhotoEditor\Service\FileService;
use OCA\PhotoEditor\Service\ThumbnailService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IRequest;
use OCP\IURLGenerator;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use Psr\Log\LoggerInterface;

class FileController extends Controller
{
    private const ERR_FILE_NOT_FOUND = 'File not found';
    private const ERR_ACCESS_DENIED = 'Access denied';
    private const ERR_NOT_A_FILE = 'Not a file';
    private const ERR_INTERNAL_SERVER_ERROR = 'Internal server error';

    public function __construct(
        string $appName,
        IRequest $request,
        private readonly FileService $fileService,
        private readonly AppConfig $appConfig,
        private readonly ThumbnailService $thumbnailService,
        private readonly IURLGenerator $urlGenerator,
        private readonly LoggerInterface $logger,
        private readonly ILockingProvider $lockingProvider,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Validate that the file is one the editor can open, and that it is not
     * larger than the configured limit.
     *
     * @return DataResponse|null Error response if validation fails, null otherwise
     */
    private function validateFile(File $file, int $fileId): ?DataResponse
    {
        $fileName = $file->getName();

        if (!Application::isSupportedFile($fileName)) {
            $this->logger->warning('Photo Editor: unsupported file extension', [
                'fileId' => $fileId,
                'extension' => strtolower(pathinfo($fileName, PATHINFO_EXTENSION)),
            ]);
            return new DataResponse(
                ['error' => 'Unsupported file type.'],
                Http::STATUS_UNSUPPORTED_MEDIA_TYPE,
            );
        }

        if ($this->fileService->exceedsMaxSize($file)) {
            $this->logger->warning('Photo Editor: file too large', [
                'fileId' => $fileId,
                'size' => $file->getSize(),
            ]);
            return new DataResponse(
                ['error' => 'File too large.'],
                Http::STATUS_REQUEST_ENTITY_TOO_LARGE,
            );
        }

        return null;
    }

    /**
     * Map a thrown exception to the response the client should see.
     */
    private function handleError(\Throwable $e, int $fileId, ?string $logMessage = null): DataResponse
    {
        $logMessage ??= $e->getMessage();

        if ($e instanceof NotFoundException) {
            $this->logger->warning('Photo Editor: file not found', ['fileId' => $fileId]);
            return new DataResponse(['error' => self::ERR_FILE_NOT_FOUND], Http::STATUS_NOT_FOUND);
        }

        if ($e instanceof NotPermittedException) {
            $this->logger->warning('Photo Editor: access denied', ['fileId' => $fileId]);
            return new DataResponse(['error' => self::ERR_ACCESS_DENIED], Http::STATUS_FORBIDDEN);
        }

        if ($e instanceof \RuntimeException) {
            $this->logger->warning('Photo Editor: unauthorized access attempt');
            return new DataResponse(['error' => 'Unauthorized'], Http::STATUS_UNAUTHORIZED);
        }

        if ($e instanceof \InvalidArgumentException) {
            return new DataResponse(['error' => self::ERR_NOT_A_FILE], Http::STATUS_BAD_REQUEST);
        }

        $this->logger->error('Photo Editor: error handling file', [
            'fileId' => $fileId,
            'error' => $logMessage,
        ]);
        return new DataResponse(
            ['error' => self::ERR_INTERNAL_SERVER_ERROR],
            Http::STATUS_INTERNAL_SERVER_ERROR,
        );
    }

    /**
     * Load an image by id and return its metadata with a download URL.
     *
     * The download URL is session-authenticated, so the client never needs a
     * second credential to fetch the bytes.
     */
    #[NoAdminRequired]
    public function load(int $fileId): DataResponse
    {
        try {
            $file = $this->fileService->resolveFile($fileId);

            $errorResponse = $this->validateFile($file, $fileId);
            if ($errorResponse !== null) {
                return $errorResponse;
            }

            $meta = $this->fileService->describe($file);
            $meta['url'] = $this->urlGenerator->linkToRouteAbsolute(
                $this->appName . '.file.download',
                ['fileId' => $fileId],
            );
            $meta['contentType'] = 'application/octet-stream';
            $meta['theme'] = $this->appConfig->getTheme();
            $meta['maxFileSize'] = $this->appConfig->getMaxFileSize();

            $this->logger->info('Photo Editor: loading file', [
                'fileId' => $fileId,
                'name' => $file->getName(),
                'size' => $file->getSize(),
            ]);

            return new DataResponse($meta);
        } catch (\Throwable $e) {
            return $this->handleError($e, $fileId);
        }
    }

    /**
     * Stream image bytes to the browser.
     *
     * Streamed rather than buffered so a large PSD does not have to be held in
     * PHP memory to reach the client.
     */
    #[NoAdminRequired]
    public function download(int $fileId): DataResponse|StreamResponse
    {
        try {
            $file = $this->fileService->resolveFile($fileId);

            if (!Application::isSupportedFile($file->getName())) {
                return new DataResponse(
                    ['error' => 'Unsupported file type.'],
                    Http::STATUS_UNSUPPORTED_MEDIA_TYPE,
                );
            }

            $stream = $file->fopen('r');
            if ($stream === false) {
                return new DataResponse(
                    ['error' => 'Could not open file'],
                    Http::STATUS_INTERNAL_SERVER_ERROR,
                );
            }

            $response = new StreamResponse($stream);
            $response->addHeader('Content-Type', 'application/octet-stream');
            $response->addHeader('Content-Length', (string) $file->getSize());
            $response->addHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            $response->addHeader(
                'Content-Disposition',
                'attachment; filename="' . addslashes($file->getName()) . '"',
            );

            return $response;
        } catch (\Throwable $e) {
            return $this->handleError($e, $fileId);
        }
    }

    /**
     * Get file metadata without the download URL.
     */
    #[NoAdminRequired]
    public function getFile(int $fileId): DataResponse
    {
        try {
            $file = $this->fileService->resolveFile($fileId);

            return new DataResponse($this->fileService->describe($file));
        } catch (\Throwable $e) {
            return $this->handleError($e, $fileId);
        }
    }

    /**
     * Write edited image bytes back to a file.
     *
     * The client posts a base64 data URL of the rendered image. The etag it
     * loaded is required and checked, so a save based on a stale copy is
     * refused instead of overwriting someone else's edit.
     */
    #[NoAdminRequired]
    public function save(int $fileId): DataResponse
    {
        try {
            $file = $this->fileService->resolveFile($fileId);

            $errorResponse = $this->validateFile($file, $fileId);
            if ($errorResponse !== null) {
                return $errorResponse;
            }

            if (!$file->isUpdateable()) {
                return new DataResponse(['error' => self::ERR_ACCESS_DENIED], Http::STATUS_FORBIDDEN);
            }

            if (!$this->fileService->canSave($file)) {
                return new DataResponse(
                    ['error' => 'This file type cannot be saved. Use export instead.'],
                    Http::STATUS_UNSUPPORTED_MEDIA_TYPE,
                );
            }

            $dataUrl = $this->request->getParam('image');
            if (!is_string($dataUrl) || $dataUrl === '') {
                return new DataResponse(['error' => 'Missing image data'], Http::STATUS_BAD_REQUEST);
            }

            $decoded = $this->decodeImageDataUrl($dataUrl);
            if ($decoded === null) {
                return new DataResponse(['error' => 'Invalid image data'], Http::STATUS_BAD_REQUEST);
            }

            if (strlen($decoded['binary']) > $this->fileService->getMaxFileSize()) {
                return new DataResponse(
                    ['error' => 'File too large.'],
                    Http::STATUS_REQUEST_ENTITY_TOO_LARGE,
                );
            }

            $etag = $this->request->getParam('etag');
            if (!is_string($etag) || $etag === '') {
                return new DataResponse(['error' => 'Missing file version'], Http::STATUS_BAD_REQUEST);
            }

            return $this->writeWithLock($file, $fileId, $decoded['binary'], $etag);
        } catch (\Throwable $e) {
            return $this->handleError($e, $fileId);
        }
    }

    /**
     * Write the new content while holding an exclusive lock on the file.
     *
     * The version is re-checked *inside* the lock, so two saves based on the
     * same etag cannot both pass and the later one silently discard the first
     * edit: the second sees the new etag and is refused with 409.
     */
    private function writeWithLock(File $file, int $fileId, string $binary, string $etag): DataResponse
    {
        $lockPath = $file->getPath();
        $locked = false;

        try {
            $this->lockingProvider->acquireLock($lockPath, ILockingProvider::LOCK_EXCLUSIVE);
            $locked = true;

            // Re-resolve the node under the lock. A Nextcloud Node caches its
            // FileInfo from before the lock, so getEtag() on the original node
            // would still report the version this request started from and two
            // overlapping saves would both pass.
            $file = $this->fileService->resolveFile($fileId);

            if ($etag !== $file->getEtag()) {
                $this->logger->info('Photo Editor: refusing save, file changed', ['fileId' => $fileId]);
                return new DataResponse(
                    ['error' => 'The file was changed by someone else. Reload it before saving.'],
                    Http::STATUS_CONFLICT,
                );
            }

            $file->putContent($binary);
            clearstatcache();

            $this->logger->info('Photo Editor: saved file', [
                'fileId' => $fileId,
                'size' => $file->getSize(),
            ]);

            return new DataResponse([
                'etag' => $file->getEtag(),
                'size' => $file->getSize(),
                'mtime' => $file->getMTime(),
            ]);
        } catch (LockedException) {
            return new DataResponse(['error' => 'The file is locked.'], Http::STATUS_CONFLICT);
        } catch (NotPermittedException) {
            return new DataResponse(['error' => self::ERR_ACCESS_DENIED], Http::STATUS_FORBIDDEN);
        } finally {
            if ($locked) {
                try {
                    $this->lockingProvider->releaseLock($lockPath, ILockingProvider::LOCK_EXCLUSIVE);
                } catch (\Throwable $e) {
                    $this->logger->warning('Photo Editor: failed to release save lock', [
                        'fileId' => $fileId,
                        'exception' => $e,
                    ]);
                }
            }
        }
    }

    /**
     * Store a browser-rendered PNG thumbnail for an image.
     *
     * The JSON body is `{"image": "data:image/png;base64,...", "etag": "<version>"}`.
     *
     * Only users who may modify the file are allowed to set its thumbnail:
     * otherwise a read-only share recipient could change the preview everyone
     * else sees.
     */
    #[NoAdminRequired]
    public function thumbnail(int $fileId): DataResponse
    {
        try {
            $file = $this->fileService->resolveFile($fileId);

            $errorResponse = $this->validateFile($file, $fileId);
            if ($errorResponse !== null) {
                return $errorResponse;
            }

            if (!$file->isUpdateable()) {
                return new DataResponse(['error' => self::ERR_ACCESS_DENIED], Http::STATUS_FORBIDDEN);
            }

            // The administrator can turn previews off; then there is no point
            // in storing thumbnails nothing will serve.
            if ($this->appConfig->getPreviews() !== 'yes') {
                return new DataResponse(['error' => 'Previews are disabled'], Http::STATUS_FORBIDDEN);
            }

            $dataUrl = $this->request->getParam('image');
            if (!is_string($dataUrl) || $dataUrl === '') {
                return new DataResponse(['error' => 'Missing image data'], Http::STATUS_BAD_REQUEST);
            }

            $decoded = $this->thumbnailService->decodePngDataUrl($dataUrl);
            if ($decoded === null) {
                return new DataResponse(['error' => 'Invalid image data'], Http::STATUS_BAD_REQUEST);
            }

            $etag = $this->request->getParam('etag');
            if (!is_string($etag) || $etag === '') {
                // The etag ties the image to the version it was rendered from;
                // without it a stale image could be accepted.
                return new DataResponse(['error' => 'Missing file version'], Http::STATUS_BAD_REQUEST);
            }

            $result = $this->thumbnailService->storeThumbnail($file, $decoded['binary'], $etag);

            if ($result === ThumbnailService::STALE) {
                return new DataResponse(['error' => 'Stale thumbnail'], Http::STATUS_CONFLICT);
            }

            if ($result === ThumbnailService::FAILED) {
                return new DataResponse(
                    ['error' => self::ERR_INTERNAL_SERVER_ERROR],
                    Http::STATUS_INTERNAL_SERVER_ERROR,
                );
            }

            return new DataResponse(['status' => 'ok']);
        } catch (\Throwable $e) {
            return $this->handleError($e, $fileId);
        }
    }

    /**
     * Decode a base64 image data URL into raw bytes.
     *
     * Only the raster formats the editor writes are accepted, and the bytes
     * must decode to a real image, so a malformed upload cannot replace a file
     * with something nothing can read.
     *
     * @return array{binary: string, mimeType: string}|null
     */
    private function decodeImageDataUrl(string $dataUrl): ?array
    {
        if (!preg_match('#^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$#', $dataUrl, $m)) {
            return null;
        }

        $binary = base64_decode($m[2], true);
        if ($binary === false || $binary === '') {
            return null;
        }

        $info = @getimagesizefromstring($binary);
        if ($info === false || $info[0] < 1 || $info[1] < 1) {
            return null;
        }

        if ($info[0] > 8192 || $info[1] > 8192) {
            return null;
        }

        return ['binary' => $binary, 'mimeType' => 'image/' . $m[1]];
    }
}
