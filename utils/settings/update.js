// @ts-nocheck
import { extensionFolderPath } from '../config.js';

async function checkForUpdates() {
    // Always try to fetch and display local version first.
    try {
        const localManifestResponse = await fetch(`${extensionFolderPath}/manifest.json?t=${new Date().getTime()}`, { cache: 'no-cache' });
        if (localManifestResponse.ok) {
            const localManifest = await localManifestResponse.json();
            const localVersion = localManifest.version;
            window.chatu8LocalVersion = localVersion;
        } else {
            console.error('Failed to fetch local manifest for version check.');
        }
    } catch (error) {
        console.error('Error fetching local manifest:', error);
    }

    // Now, check for remote updates.
    const updateNotesElement = document.getElementById('ch-update-notes');

    console.log("Checking for updates...", updateNotesElement);
    try {
        // Fetch remote manifest
        const remoteManifestUrl = `https://raw.githubusercontent.com/damoshen123/st-chatu8/master/manifest.json?t=${new Date().getTime()}`;
        const response = await fetch(remoteManifestUrl, { cache: 'no-cache' });
        if (!response.ok) {
            console.error('Failed to fetch remote manifest for update check.');
            if (updateNotesElement) {
                updateNotesElement.value = '无法获取最新更新，尝试点击更新按钮，检查更新。';
            }
            window.chatu8UpdateAvailable = false;
            return; // Exit if remote check fails, but local version is already set.
        }
        const remoteManifest = await response.json();
        const remoteVersion = remoteManifest.version;

        // Store remote version for UI
        window.chatu8RemoteVersion = remoteVersion;

        if (updateNotesElement && remoteManifest.updata) {
            updateNotesElement.value = remoteManifest.updata;
        }

        // Compare versions if local version is available
        if (window.chatu8LocalVersion) {
            if (remoteVersion.localeCompare(window.chatu8LocalVersion, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
                console.log(`New version available: ${remoteVersion} (current: ${window.chatu8LocalVersion})`);
                window.chatu8UpdateAvailable = true;
            } else {
                console.log('Extension is up to date.');
                window.chatu8UpdateAvailable = false;
            }
        } else {
            // If local version couldn't be read, we can't compare.
            window.chatu8UpdateAvailable = false;
        }
    } catch (error) {
        console.error('Error checking for updates:', error);
        if (updateNotesElement) {
            updateNotesElement.value = '无法获取最新更新，尝试点击更新按钮，检查更新。';
        }
        window.chatu8UpdateAvailable = false; // Ensure it's false on error
    }
}

function updateVersionInfo() {
    const versionDisplay = document.getElementById('ch-version-display');
    if (versionDisplay && window.chatu8LocalVersion) {
        versionDisplay.textContent = `v${window.chatu8LocalVersion}`;
    }

    const updateIndicator = document.getElementById('ch-update-indicator');
    const titleUpdateNotification = document.getElementById('ch-title-update-notification');

    if (window.chatu8UpdateAvailable) {
        if (updateIndicator) {
            updateIndicator.style.display = 'inline';
        }
        if (titleUpdateNotification) {
            titleUpdateNotification.style.display = 'inline';
        }
    }
}

export async function initUpdateCheck(settingsModal, check_update_func) {
    settingsModal.find('#ch-check-update').on('click', check_update_func);
    await checkForUpdates();
    updateVersionInfo();
}
