// @ts-nocheck
import { extension_settings } from "../../../../extensions.js";
import { extensionName, defaultSettings } from './config.js';

export function getSuffix(mode) {
    if (mode === 'sd') return '';
    return `_${mode}`;
}

export function isValidUrl(string) {
    if (!string || string.trim() === '') return true;
    const urlRegex = /^(https?:\/\/)?(localhost|([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)*$/;
    return urlRegex.test(string);
}

export function validateUrlInput(inputElement) {
    if (!inputElement) return;
    const parentGroup = inputElement.closest('.st-chatu8-input-group');
    if (!parentGroup) return;

    const isValid = isValidUrl(inputElement.value);
    parentGroup.classList.toggle('invalid', !isValid);
}



export function size_change(prefix) {
    if (prefix == "sd") {
        prefix = "sd_c"
    } else {
        prefix = prefix + "_"
    }

    const width = document.getElementById(`${prefix}width`);
    const height = document.getElementById(`${prefix}height`);
    const selectElement = document.getElementById(`${prefix}size`);
    if (width && height && selectElement) {
        const [selectElementwidth, selectElementheight] = selectElement.value.split("x");
        width.value = selectElementwidth;
        height.value = selectElementheight;
        $(width).trigger('input');
        $(height).trigger('input');
    }
}

export function stylInput(message, defaultValue = '') {
    return new Promise((resolve) => {
        const parent = document.getElementById('st-chatu8-settings') || document.body;

        const backdrop = document.createElement('div');
        backdrop.className = 'st-chatu8-confirm-backdrop';

        const confirmBox = document.createElement('div');
        confirmBox.className = 'st-chatu8-confirm-box';

        const messageText = document.createElement('p');
        messageText.textContent = message;
        messageText.className = 'st-chatu8-confirm-message';
        confirmBox.appendChild(messageText);

        const messageinput = document.createElement('input');
        messageinput.className = 'st-chatu8-text-input';
        messageinput.value = defaultValue;
        confirmBox.appendChild(messageinput);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'st-chatu8-confirm-buttons';
        confirmBox.appendChild(buttonContainer);

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.className = 'st-chatu8-btn';
        buttonContainer.appendChild(cancelButton);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = '确定';
        confirmButton.className = 'st-chatu8-btn';
        buttonContainer.appendChild(confirmButton);

        backdrop.appendChild(confirmBox);
        parent.appendChild(backdrop);

        const close = (value) => {
            parent.removeChild(backdrop);
            resolve(value);
        };

        cancelButton.addEventListener('click', () => close(false));
        confirmButton.addEventListener('click', () => close(messageinput.value));
        messageinput.focus();
    });
}

export function stylishConfirm(message) {
    return new Promise((resolve) => {
        const parent = document.getElementById('st-chatu8-settings') || document.body;

        const backdrop = document.createElement('div');
        backdrop.className = 'st-chatu8-confirm-backdrop';
        backdrop.style.zIndex = '99999';

        const confirmBox = document.createElement('div');
        confirmBox.className = 'st-chatu8-confirm-box';

        const messageText = document.createElement('p');
        messageText.textContent = message;
        messageText.className = 'st-chatu8-confirm-message';
        confirmBox.appendChild(messageText);

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'st-chatu8-confirm-buttons';
        confirmBox.appendChild(buttonContainer);

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.className = 'st-chatu8-btn';
        buttonContainer.appendChild(cancelButton);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = '确定';
        confirmButton.className = 'st-chatu8-btn';
        buttonContainer.appendChild(confirmButton);

        backdrop.appendChild(confirmBox);
        parent.appendChild(backdrop);

        const close = (value) => {
            parent.removeChild(backdrop);
            resolve(value);
        };

        cancelButton.addEventListener('click', () => close(false));
        confirmButton.addEventListener('click', () => close(true));
        confirmButton.focus();
    });
}

export function showSettingsPanel() {
    const settings = extension_settings[extensionName];
    const panel = $('#ch-settings-modal');
    if (!panel.length) {
        console.error("Settings panel not found!");
        return;
    }

    const lastTab = settings.lastTab || 'main';
    const lastTabLink = panel.find(`.st-chatu8-nav-link[data-tab="${lastTab}"]`);

    if (lastTabLink.length) {
        lastTabLink.click();
    } else {
        panel.find('.st-chatu8-nav-link[data-tab="main"]').click();
    }

    const content = panel.find('.st-chatu8-modal-content');
    if (window.innerWidth <= 768) {
        const buttonHeight = $('#ai-config-button').outerHeight(true) || 0;
        panel.css({ 'align-items': 'start' });

        const sendForm = document.getElementById('leftSendForm');
        const sendFormTop = sendForm ? sendForm.getBoundingClientRect().top : window.innerHeight;
        const newHeight = sendFormTop - buttonHeight - 15; // 15px for padding

        content.css({
            'margin-top': `${buttonHeight}px`,
            'height': `${newHeight}px`
        });
    } else {
        panel.css({ 'align-items': '' });
        content.css({
            'margin-top': '',
            'height': ''
        });
    }
    panel.css('display', 'grid');
    panel.find('.st-chatu8-modal-content').focus();
}

export function hideSettingsPanel() {
    const panel = $('#ch-settings-modal');
    panel.hide();
    panel.css({ 'align-items': '', 'padding-top': '' });
    panel.find('.st-chatu8-modal-content').css({
        'margin-top': '',
        'height': ''
    });
}

export function showToast(message, type = 'info', duration = 3000) {
    if (typeof toastr === 'undefined') {
        console.warn('toastr is not defined, fallback to console.log');
        console.log(`[${type}] ${message}`);
        return;
    }

    toastr.options = {
        ...toastr.options,
        "timeOut": duration,
        "progressBar": true,
        "preventDuplicates": true,
        "newestOnTop": true
    };

    if (toastr[type]) {
        toastr[type](message);
    } else {
        toastr.info(message);
    }
}

export function applyFabSettings() {
    const settings = extension_settings[extensionName];
    const fab = $('#st-chatu8-fab');
    if (!fab.length) return;

    if (String(settings.enable_chatu8_fab) === 'true') {
        fab.show();
        fab.css('background-color', settings.chatu8_fab_bg_color || '#ADD8E6');
        fab.find('i').css('color', settings.chatu8_fab_icon_color || '#FFFFFF');
        fab.css('opacity', settings.chatu8_fab_opacity ?? 1);

        const size = settings.chatu8_fab_size ?? 50;
        fab.css('width', `${size}px`);
        fab.css('height', `${size}px`);
        fab.find('i').css('font-size', `${Math.round(size * 0.48)}px`);

        const isMobile = window.innerWidth <= 768;
        const position = isMobile
            ? (settings.chatu8_fab_position.mobile || defaultSettings.chatu8_fab_position.mobile)
            : (settings.chatu8_fab_position.desktop || defaultSettings.chatu8_fab_position.desktop);

        fab.css('top', position.top);
        fab.css('left', position.left);
    } else {
        fab.hide();
    }
}
