// @ts-nocheck
// Import modules
import { extension_settings, extensionTypes } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, reloadCurrentChat, saveChatConditional, chat, messageFormatting, saveChat } from "../../../../script.js";
import { defaultSettings, extensionName, extensionFolderPath } from './utils/config.js';
import { replaceWithSd } from './utils/sd.js';
import { replaceWithnovelai } from './utils/novelai.js';
// import { replaceSpansWithImagesstcomfyui } from './utils/comfyui.js';
import { initUI } from './utils/ui.js';
import { replaceWithBanana } from './utils/banana.js';
import { checkSendBuClass } from './utils/utils.js';
import { replaceWithcomfyui } from "./utils/comfyui.js";
import { initializeNewlineFixer } from './utils/newline_fix.js';
import { } from './utils/settings/stream_generate.js';

let token;

try {
    const tokenResponse = await fetch('/csrf-token');
    const data = await tokenResponse.json();
    token = data.token;

    window.token = token;

} catch (err) {
    console.error('Initialization failed', err);
    throw new Error('Initialization failed');
}


function loadJSZip() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${extensionFolderPath}/jszip.min.js`;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });
}

function loadcrypto() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${extensionFolderPath}/crypto-js.min.js`;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });
}

function loadmsgpack() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${extensionFolderPath}/msgpack.min.js`;
        script.onload = () => resolve();
        script.onerror = (err) => reject(err);
        document.head.appendChild(script);
    });
}

function getRequestHeaders(token) {
    return {
        'X-CSRF-Token': token,
        'Content-Type': 'application/json',
    };
}

function getExtensionType(externalId) {
    const id = Object.keys(extensionTypes).find(
        (id) => id === externalId || (id.startsWith('third-party') && id.endsWith(externalId)),
    );
    return id ? extensionTypes[id] : 'local';
}

async function update_extension(extensionname, global) {
    const response = await fetch('/api/extensions/update', {
        method: 'POST',
        headers: getRequestHeaders(token),
        body: JSON.stringify({ extensionName: extensionname, global }),
    });
    return response;
}

async function check_update() {
    const global = getExtensionType(extensionName) === 'global' ? true : false;

    const reload = () => {
        toastr.success(`成功更新插件`);
        console.log(`成功更新插件`);
        setTimeout(() => location.reload(), 4000);
    };

    const update_response = await update_extension(extensionName, global);
    if (update_response.ok) {
        if ((await update_response.json()).isUpToDate) {
            toastr.success("插件是最新版本");
            console.log("插件是最新版本");
        } else {
            reload();
        }
        return true;
    }
}


async function chenk() {
    if (!(extension_settings[extensionName].scriptEnabled == true || extension_settings[extensionName].scriptEnabled == "true") || checkSendBuClass()) {
        //  console.log("chatu is disabled.");
        return;
    }
    // console.log("chatu is enabled.",extension_settings[extensionName].scriptEnabled=="true");

    replaceWithcomfyui();
    replaceWithBanana();
    replaceWithBanana();
    replaceWithnovelai();
    replaceWithSd();
}

// 使用方式
await loadJSZip().then(() => {
    // JSZip 加载完毕，可以使用

    console.log("Initializing..JSZip.");

});
await loadcrypto().then(() => {
    // JSZip 加载完毕，可以使用
    console.log("Initializing..CryptoJS.");

});
await loadmsgpack().then(() => {
    // JSZip 加载完毕，可以使用
    console.log("Initializing..msgpack.");

});
// Global state variables
let ster = "";
window.imagesid = "";
window.xiancheng = true;
let settings;


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

    console.log("Checking for updates...111111111111111111111111111111111111111", updateNotesElement);
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


main()

function loadCSS(url) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `${extensionFolderPath}/${url}?t=${new Date().getTime()}`;
    document.head.appendChild(link);
}

// Main initialization function
async function main() {
    const cssFiles = [
        'styles/main.css',
        'styles/about.css',
        'styles/forms.css',
        'styles/cache.css',
        'styles/image_cache.css',
        'styles/modals.css',
        'styles/fab.css',
        'styles/responsive.css',
        'styles/click-trigger.css'
    ];
    cssFiles.forEach(loadCSS);

    console.log("Initializing chatu extension.");
    const mergedSettings = { ...JSON.parse(JSON.stringify(defaultSettings)), ...extension_settings[extensionName] };
    extension_settings[extensionName] = mergedSettings;

    console.log("Initializing chatu extension.", extension_settings[extensionName]);

    await initUI({ check_update });

    // 手势监控和点击触发监控已在 initUI() 内部调用，无需在此重复调用

    // Initialize the newline fixer.
    initializeNewlineFixer();

    setTimeout(addNewElement, 2000);

    // Start the main loop
    setInterval(chenk, 4000);
    await checkForUpdates();
    // Set up listeners for communication from other scripts
}


function addNewElement() {
    const targetElement = document.querySelector('#option_toggle_AN');
    if (targetElement) {
        if (!document.getElementById('option_toggle_AN88')) {
            const newElement = document.createElement('a');
            newElement.id = 'option_toggle_AN88';
            const icon = document.createElement('i');
            icon.className = 'fa-lg fa-solid fa-note-sticky';
            newElement.appendChild(icon);
            const span = document.createElement('span');
            span.setAttribute('data-i18n', "打开设置");
            span.textContent = '打开文生图设置';
            newElement.appendChild(span);
            targetElement.parentNode.insertBefore(newElement, targetElement.nextSibling);
            console.log("chatu settings button added.");
            document.getElementById('option_toggle_AN88').addEventListener('click', window.showChatuSettingsPanel);
        }
    }
}
