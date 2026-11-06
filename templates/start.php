<?php

declare(strict_types=1);

/** @var array $_ */
$recentImages = $_['recentImages'] ?? [];
$recentJson = (string) json_encode(
    $recentImages,
    JSON_THROW_ON_ERROR | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT,
);
?>
<div id="photo-editor-start"
     data-recent-images="<?php echo htmlspecialchars($recentJson, ENT_QUOTES, 'UTF-8'); ?>">
    <noscript>
        <p><?php echo $l->t('JavaScript is required to use the Photo Editor.'); ?></p>
    </noscript>
</div>
