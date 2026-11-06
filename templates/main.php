<?php

declare(strict_types=1);

/** @var array $_ */
$fileIds = (string) ($_['fileIds'] ?? '');
$requestToken = (string) ($_['requesttoken'] ?? '');
?>
<div id="photo-editor-container"
     data-file-ids="<?php echo htmlspecialchars($fileIds, ENT_QUOTES, 'UTF-8'); ?>"
     data-request-token="<?php echo htmlspecialchars($requestToken, ENT_QUOTES, 'UTF-8'); ?>">
    <noscript>
        <p><?php echo $l->t('JavaScript is required to use the Photo Editor.'); ?></p>
    </noscript>
</div>
