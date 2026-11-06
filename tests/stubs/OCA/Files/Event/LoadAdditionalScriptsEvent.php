<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * A stand-in for the Files app's LoadAdditionalScriptsEvent.
 *
 * The class lives in the Files app, not in the public OCP package, so a unit
 * test that has no Files app installed has to provide it. Only the shape the
 * listener dispatches on is reproduced.
 */

declare(strict_types=1);

namespace OCA\Files\Event;

use OCP\EventDispatcher\Event;

class LoadAdditionalScriptsEvent extends Event
{
}
