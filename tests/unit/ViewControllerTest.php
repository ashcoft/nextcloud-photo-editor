<?php

/**
 * SPDX-FileCopyrightText: 2026 Photo Editor Contributors
 * SPDX-License-Identifier: MIT
 */

declare(strict_types=1);

namespace OCA\PhotoEditor\Tests\Unit;

use OCA\PhotoEditor\Controller\ViewController;
use OCA\PhotoEditor\Service\RecentImagesService;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use PHPUnit\Framework\Attributes\AllowMockObjectsWithoutExpectations;
use PHPUnit\Framework\TestCase;

/**
 * Test suite for the page controller.
 *
 * @covers \OCA\PhotoEditor\Controller\ViewController
 */
#[AllowMockObjectsWithoutExpectations]
class ViewControllerTest extends TestCase
{
    private function controller(array $recent = []): ViewController
    {
        $recentImages = $this->createMock(RecentImagesService::class);
        $recentImages->method('getRecentImages')->willReturn($recent);

        return new ViewController(
            'photo_editor',
            $this->createMock(IRequest::class),
            $recentImages,
        );
    }

    public function testIndexRendersTheStartPageWithRecentImages(): void
    {
        $recent = [[
            'id' => 1,
            'name' => 'a.png',
            'path' => '/a.png',
            'extension' => 'png',
            'mtime' => 100,
            'isPsd' => false,
        ]];

        $response = $this->controller($recent)->index();

        $this->assertInstanceOf(TemplateResponse::class, $response);
        $this->assertSame('start', $response->getTemplateName());
        $this->assertSame($recent, $response->getParams()['recentImages']);
    }

    public function testViewRendersTheEditorWithTheFileId(): void
    {
        $response = $this->controller()->view('42');

        $this->assertSame('main', $response->getTemplateName());
        $this->assertSame('42', $response->getParams()['fileIds']);
    }

    public function testViewWithoutAFileShowsTheStartPage(): void
    {
        // `/view` with no id would otherwise mount the editor with nothing to
        // open, leaving it on a permanent loading overlay.
        $response = $this->controller()->view();

        $this->assertSame('start', $response->getTemplateName());
    }

    public function testViewWithBlankFileIdShowsTheStartPage(): void
    {
        $response = $this->controller()->view('   ');

        $this->assertSame('start', $response->getTemplateName());
    }

    public function testViewAcceptsTheSingularFileId(): void
    {
        // The client reads either `fileIds` or `fileId` from the URL, so the
        // controller has to accept both or a `?fileId=` link opens nothing.
        $response = $this->controller()->view('', '42');

        $this->assertSame('main', $response->getTemplateName());
        $this->assertSame('42', $response->getParams()['fileIds']);
    }

    public function testViewPrefersFileIdsOverFileId(): void
    {
        $response = $this->controller()->view('7', '42');

        $this->assertSame('7', $response->getParams()['fileIds']);
    }
}
