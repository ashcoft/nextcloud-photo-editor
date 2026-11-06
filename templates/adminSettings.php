<?php
// Scripts and styles are added in AdminSettingsController::index().
?>
<div id="photo-editor" class="section section-photo-editor">
    <h2>Photo Editor</h2>

    <div class="photo-editor-setting">
        <label for="photo-editor-theme"><?php p($l->t('Theme:')) ?></label>
        <select id="photo-editor-theme">
            <option
                value="light"
                <?php if ($_['theme'] === 'light') {
                    echo ' selected';
                } ?>
            ><?php p($l->t('Light')) ?></option>
            <option
                value="dark"
                <?php if ($_['theme'] === 'dark') {
                    echo ' selected';
                } ?>
            ><?php p($l->t('Dark')) ?></option>
        </select>
        <p class="photo-editor-hint">
            <?php p($l->t('Note: The theme used when an image is opened in the editor.')) ?>
        </p>
    </div>

    <div class="photo-editor-setting">
        <label for="photo-editor-previews"><?php p($l->t('Enable file previews?')) ?></label>
        <select id="photo-editor-previews">
            <option
                value="yes"
                <?php if ($_['previews'] === 'yes') {
                    echo ' selected';
                } ?>
            ><?php p($l->t('Yes')) ?></option>
            <option
                value="no"
                <?php if ($_['previews'] === 'no') {
                    echo ' selected';
                } ?>
            ><?php p($l->t('No')) ?></option>
        </select>
        <p class="photo-editor-hint">
            <?php p($l->t('Note: Disable previews to save storage space for Photoshop previews.')) ?>
        </p>
    </div>

    <div class="photo-editor-setting">
        <label for="photo-editor-max-size"><?php p($l->t('Maximum file size (MB):')) ?></label>
        <input
            id="photo-editor-max-size"
            type="number"
            min="1"
            max="512"
            step="1"
            value="<?php p((string) $_['maxSizeMb']) ?>"
        >
        <p class="photo-editor-hint">
            <?php p($l->t('Note: The largest file the editor will open, in megabytes.')) ?>
        </p>
    </div>

    <button type="button" id="photo-editor-save" class="button primary">
        <?php p($l->t('Save')) ?>
    </button>
    <span id="photo-editor-status" class="photo-editor-status" role="status"></span>
</div>
