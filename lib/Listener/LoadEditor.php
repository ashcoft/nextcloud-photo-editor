<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Listener;

use OCA\PhotoEditor\AppInfo\Application;
use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Loads the photo editor script on the Files app and on the app's own pages.
 *
 * The script is loaded with addInitScript so the "Open with Photo Editor" file
 * action is registered before the Files list takes its first snapshot of the
 * available actions.
 *
 * Public share pages are deliberately skipped: the editor route and the file
 * API require a logged-in user, so offering the action there would send an
 * anonymous visitor to the login page.
 *
 * @template-implements IEventListener<LoadAdditionalScriptsEvent|BeforeTemplateRenderedEvent>
 */
class LoadEditor implements IEventListener
{
    #[\Override]
    public function handle(Event $event): void
    {
        if ($event instanceof LoadAdditionalScriptsEvent) {
            $this->addScripts();
            return;
        }

        if (
            $event instanceof BeforeTemplateRenderedEvent
            && $event->getResponse()->getApp() === Application::APP_ID
        ) {
            $this->addScripts();
        }
    }

    /**
     * Add the photo editor init script and stylesheet.
     */
    private function addScripts(): void
    {
        Util::addInitScript(Application::APP_ID, 'photo-editor');
        Util::addStyle(Application::APP_ID, 'photo-editor');
    }
}
