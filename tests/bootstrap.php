<?php

declare(strict_types=1);

require_once __DIR__ . '/stubs/OC/OC.php';
require_once __DIR__ . '/stubs/OC/Hooks/Emitter.php';

$autoload = __DIR__ . '/../vendor/autoload.php';
if (file_exists($autoload)) {
    require_once $autoload;
}

$ocpAutoload = __DIR__ . '/../vendor-bin/nextcloud-ocp/vendor/autoload.php';
if (file_exists($ocpAutoload)) {
    require_once $ocpAutoload;
}

// The Files app is not installed in a unit-test environment, so its event is
// provided by a local stub. Required explicitly because the stub namespace is
// outside the composer autoload paths.
require_once __DIR__ . '/stubs/OCA/Files/Event/LoadAdditionalScriptsEvent.php';
