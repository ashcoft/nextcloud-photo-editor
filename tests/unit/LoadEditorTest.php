<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Unit;

use OCA\PhotoEditor\AppInfo\Application;
use OCA\PhotoEditor\Listener\LoadEditor;
use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;
use PHPUnit\Framework\TestCase;

/**
 * Test suite for the script-loading listener.
 *
 * The listener's only collaborator is Nextcloud's static script registry, which
 * cannot be observed from a unit test, so these tests assert that it runs for
 * the right events and stays quiet for the wrong ones. That is the behaviour
 * the listener owns; what the registry then does with the call is Nextcloud's.
 *
 * @covers \OCA\PhotoEditor\Listener\LoadEditor
 */
class LoadEditorTest extends TestCase
{
    private LoadEditor $listener;

    protected function setUp(): void
    {
        parent::setUp();
        $this->listener = new LoadEditor();
        Util::reset();
    }

    /**
     * Build a BeforeTemplateRenderedEvent whose response reports the given app.
     *
     * `TemplateResponse::getApp()` returns the app name it was constructed
     * with, so no subclass is needed.
     */
    private function templateEvent(string $appName): BeforeTemplateRenderedEvent
    {
        $response = new TemplateResponse($appName, 'main');

        return new BeforeTemplateRenderedEvent(true, $response);
    }

    public function testImplementsIEventListener(): void
    {
        $this->assertInstanceOf(IEventListener::class, $this->listener);
    }

    public function testHandleIgnoresAnUnrelatedEvent(): void
    {
        $this->listener->handle(new class () extends Event {
        });

        $this->addToAssertionCount(1);
    }

    public function testHandleLoadsAssetsForTheFilesApp(): void
    {
        $this->listener->handle(new LoadAdditionalScriptsEvent());

        $this->assertContains(['init', Application::APP_ID, 'photo-editor'], Util::$calls);
        $this->assertContains(['style', Application::APP_ID, 'photo-editor'], Util::$calls);
    }

    public function testHandleLoadsAssetsForTheAppsOwnPages(): void
    {
        $this->listener->handle($this->templateEvent(Application::APP_ID));

        $this->assertContains(['init', Application::APP_ID, 'photo-editor'], Util::$calls);
    }

    public function testHandleIgnoresOtherAppsPages(): void
    {
        foreach (['dashboard', 'files', '', 'photo_editor_extra'] as $app) {
            $this->listener->handle($this->templateEvent($app));
        }

        $this->assertSame([], Util::$calls);
    }
}
