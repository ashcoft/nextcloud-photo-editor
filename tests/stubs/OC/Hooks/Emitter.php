<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 *
 * The private emitter interface that OCP\Files\IRootFolder extends. The OCP
 * package references it but does not ship it, so a unit test needs the stub
 * for the interface to be loadable.
 */

declare(strict_types=1);

namespace OC\Hooks;

interface Emitter
{
}
