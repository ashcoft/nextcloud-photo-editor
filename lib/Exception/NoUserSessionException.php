<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Exception;

use RuntimeException;

/**
 * Raised when an endpoint is reached without an authenticated user.
 */
class NoUserSessionException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('No user session');
    }
}
