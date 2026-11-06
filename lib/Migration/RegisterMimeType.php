<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Migration;

use OCA\PhotoEditor\AppInfo\Application;
use OCP\Migration\IOutput;

/**
 * Registers the Photoshop PSD/PSB MIME types so Nextcloud recognises them
 * instead of treating them as application/octet-stream.
 */
class RegisterMimeType extends MimeTypeMigration
{
    private const EXTENSION_MAPPING = [
        'psd' => ['image/vnd.adobe.photoshop'],
        'psb' => ['image/vnd.adobe.photoshop-large'],
    ];

    /**
     * Alias MIME type to canonical MIME type.
     *
     * `mimetypealiases.json` resolves an alias to the type Nextcloud should
     * treat the file as, so the values are canonical MIME types rather than
     * bare extensions. This mirrors the `mimetypealiases` block in
     * `appinfo/mimetypes.json`.
     */
    private const ALIAS_MAPPING = [
        'image/x-photoshop' => Application::CANONICAL_PSD_MIME,
        'image/photoshop' => Application::CANONICAL_PSD_MIME,
        'image/psd' => Application::CANONICAL_PSD_MIME,
        'image/x-psd' => Application::CANONICAL_PSD_MIME,
        'application/x-photoshop' => Application::CANONICAL_PSD_MIME,
        'image/psb' => Application::CANONICAL_PSB_MIME,
        'image/x-psb' => Application::CANONICAL_PSB_MIME,
    ];

    #[\Override]
    public function getName(): string
    {
        return 'Register MIME types for Photo Editor';
    }

    #[\Override]
    public function run(IOutput $output): void
    {
        $output->info('Registering the Photoshop MIME types...');

        $this->registerForExistingFiles();
        $this->registerForNewFiles($output);

        $output->info('The Photoshop MIME types were successfully registered.');
    }

    /**
     * Re-detect the MIME type of files uploaded before the mapping existed.
     */
    private function registerForExistingFiles(): void
    {
        $psdId = $this->mimeTypeLoader->getId(Application::CANONICAL_PSD_MIME);
        $this->mimeTypeLoader->updateFilecache('psd', $psdId);

        $psbId = $this->mimeTypeLoader->getId(Application::CANONICAL_PSB_MIME);
        $this->mimeTypeLoader->updateFilecache('psb', $psbId);
    }

    /**
     * Write the extension mapping and aliases for files uploaded later.
     *
     * A config directory that cannot be written is not fatal: `Application::boot`
     * registers the same mappings in memory for the life of the process, so the
     * app still works and only files uploaded before the next writable run keep
     * the generic type. Failing the repair step would abort installation
     * instead.
     */
    private function registerForNewFiles(IOutput $output): void
    {
        foreach ([
            self::CUSTOM_MIMETYPEMAPPING => self::EXTENSION_MAPPING,
            self::CUSTOM_MIMETYPEALIASES => self::ALIAS_MAPPING,
        ] as $file => $data) {
            try {
                $this->mergeIntoConfigFile(\OC::$configDir . $file, $data);
            } catch (\RuntimeException $e) {
                $output->warning(sprintf(
                    'Could not write %s (%s). The MIME types are registered for this run only.',
                    $file,
                    $e->getMessage(),
                ));
            }
        }
    }

    /**
     * Merge entries into a JSON config file, creating it when absent.
     *
     * @param string $filename Absolute path of the config file.
     * @param array<string, mixed> $data Entries to merge in.
     *
     * @throws \RuntimeException When the config file cannot be read or written.
     */
    private function mergeIntoConfigFile(string $filename, array $data): void
    {
        $existing = [];

        if (file_exists($filename)) {
            $contents = @file_get_contents($filename);
            if ($contents === false) {
                throw new \RuntimeException(
                    sprintf('Could not read the MIME mapping file %s', $filename)
                );
            }

            if (trim($contents) === '') {
                // An empty file holds no mappings and is safe to populate.
                $existing = [];
            } else {
                $decoded = json_decode($contents, true);
                if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
                    // Refuse to overwrite a file we cannot parse or that is not
                    // a mapping object; clobbering it would silently drop the
                    // mappings other apps registered.
                    throw new \RuntimeException(
                        sprintf('Could not parse the MIME mapping file %s', $filename)
                    );
                }
                $existing = $decoded;
            }
        }

        $written = @file_put_contents(
            $filename,
            json_encode(array_merge($existing, $data), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        );

        if ($written === false) {
            throw new \RuntimeException(
                sprintf('Could not write the Photo Editor MIME mapping to %s', $filename)
            );
        }
    }
}
