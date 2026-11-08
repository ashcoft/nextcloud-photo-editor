<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Controller;

use OCA\PhotoEditor\Service\PhotocraftBundleService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\Attribute\NoCSRFRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\Response;
use OCP\AppFramework\Http\StreamResponse;
use OCP\Files\NotFoundException;
use OCP\IRequest;

/**
 * Serves the vendored PhotoCraft web build.
 *
 * The bundle is a static site; this controller is the only way it reaches the
 * browser, so the app does not depend on the web server being configured to
 * expose an app subdirectory. Each response carries the content type the
 * browser needs - notably `application/wasm`, without which the module is
 * refused.
 *
 * Public, like the app's own scripts: the bundle contains no user data, and
 * requiring a session here would break the iframe's subresource requests,
 * which carry no CSRF token.
 */
class PhotocraftController extends Controller
{
    public function __construct(
        string $appName,
        IRequest $request,
        private readonly PhotocraftBundleService $bundle,
    ) {
        parent::__construct($appName, $request);
    }

    /**
     * Stream one file from the bundle.
     *
     * @param string $path Relative path inside the bundle, e.g. `index.html`.
     */
    #[NoAdminRequired]
    #[NoCSRFRequired]
    public function asset(string $path = ''): Response
    {
        try {
            $absolute = $this->bundle->resolve($path);
        } catch (NotFoundException) {
            return new DataResponse(['error' => 'Not found'], Http::STATUS_NOT_FOUND);
        }

        $stream = fopen($absolute, 'rb');
        if ($stream === false) {
            return new DataResponse(['error' => 'Not found'], Http::STATUS_NOT_FOUND);
        }

        $response = new StreamResponse($stream);
        // The type comes from the file that was resolved, not the requested
        // path: a request for the bundle root maps to `index.html`, and the
        // empty path would otherwise be served as octet-stream.
        $response->addHeader('Content-Type', $this->bundle->contentTypeFor($absolute));

        // The `.part-*` files are gzip already; the page inflates them itself.
        // Declaring the encoding here would make the browser inflate them a
        // second time and the module would fail to compile.
        $response->addHeader('X-Content-Type-Options', 'nosniff');

        // Content-hashed files may be cached indefinitely; the entry files keep
        // their names across releases, so a cached copy would pair old
        // JavaScript with a new module (or name a part that no longer exists)
        // and the editor would fail to start. They revalidate instead.
        $response->addHeader('Cache-Control', $this->cacheControlFor($path));

        return $response;
    }

    /**
     * Cache policy for a bundle path.
     *
     * The hosting guide names `index.html`, `app/photocraft-web.js` and
     * `app/parts.txt` as the files that keep their names, so those are the ones
     * that must not be cached past a release.
     */
    private function cacheControlFor(string $path): string
    {
        $normalised = ltrim($path, '/');
        $revalidating = ['index.html', 'app/photocraft-web.js', 'app/parts.txt', ''];

        return in_array($normalised, $revalidating, true)
            ? 'no-cache'
            : 'public, max-age=31536000, immutable';
    }
}
