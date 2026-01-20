// @ts-nocheck
import { extension_settings } from "../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../script.js";
import { extensionName } from '../config.js';
import { showSettingsPanel, applyFabSettings } from '../ui_common.js';

export function initFab() {
    let fab = document.getElementById('st-chatu8-fab');
    if (!fab) return;

    let isDragging = false;
    let hasMoved = false;
    let offsetX, offsetY;

    const dragStart = (e) => {
        isDragging = true;
        hasMoved = false;
        fab.style.cursor = 'grabbing';
        fab.classList.add('st-chatu8-fab-dragging');

        const rect = fab.getBoundingClientRect();
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        offsetX = clientX - rect.left;
        offsetY = clientY - rect.top;

        document.addEventListener('mousemove', dragMove);
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);
    };

    const dragMove = (e) => {
        if (!isDragging) return;
        if (e.type === 'touchmove') e.preventDefault();
        hasMoved = true;

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        let newLeft = clientX - offsetX;
        let newTop = clientY - offsetY;

        const fabWidth = fab.offsetWidth;
        const fabHeight = fab.offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        if (newLeft < 0) newLeft = 0;
        if (newTop < 0) newTop = 0;
        if (newLeft + fabWidth > screenWidth) newLeft = screenWidth - fabWidth;
        if (newTop + fabHeight > screenHeight) newTop = screenHeight - fabHeight;

        fab.style.left = `${newLeft}px`;
        fab.style.top = `${newTop}px`;
    };

    const dragEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        fab.style.cursor = 'grab';
        fab.classList.remove('st-chatu8-fab-dragging');

        if (hasMoved) {
            const settings = extension_settings[extensionName];
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                settings.chatu8_fab_position.mobile.top = fab.style.top;
                settings.chatu8_fab_position.mobile.left = fab.style.left;
            } else {
                settings.chatu8_fab_position.desktop.top = fab.style.top;
                settings.chatu8_fab_position.desktop.left = fab.style.left;
            }
            saveSettingsDebounced();
        }

        document.removeEventListener('mousemove', dragMove);
        document.removeEventListener('touchmove', dragMove);
        document.removeEventListener('mouseup', dragEnd);
        document.removeEventListener('touchend', dragEnd);
    };

    fab.addEventListener('mousedown', dragStart);
    fab.addEventListener('touchstart', dragStart, { passive: false });

    fab.addEventListener('click', () => {
        if (!hasMoved) {
            showSettingsPanel();
        }
    });

    applyFabSettings();

    window.addEventListener('resize', () => {
        if (String(extension_settings[extensionName].enable_chatu8_fab) === 'true') {
            const fab = document.getElementById('st-chatu8-fab');
            const rect = fab.getBoundingClientRect();
            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;

            let newLeft = rect.left;
            let newTop = rect.top;

            if (newLeft + rect.width > screenWidth) newLeft = screenWidth - rect.width;
            if (newTop + rect.height > screenHeight) newTop = screenHeight - rect.height;
            if (newLeft < 0) newLeft = 0;
            if (newTop < 0) newTop = 0;

            fab.style.left = `${newLeft}px`;
            fab.style.top = `${newTop}px`;
        }
    });
}

/**
 * 启动悬浮球加载动画
 */
export function startFabLoading() {
    const fab = document.getElementById('st-chatu8-fab');
    if (fab) {
        fab.classList.add('st-chatu8-fab-loading');
    }
}

/**
 * 停止悬浮球加载动画
 */
export function stopFabLoading() {
    const fab = document.getElementById('st-chatu8-fab');
    if (fab) {
        fab.classList.remove('st-chatu8-fab-loading');
    }
}
