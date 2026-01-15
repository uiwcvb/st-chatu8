// @ts-nocheck
/**
 * iframe 模块主入口
 * 初始化和事件监听
 */

import { eventSource, event_types } from "../../../../../../script.js";
import { extension_settings } from "../../../../../extensions.js";
import { extensionName } from '../config.js';
import { getContext } from "../../../../../st-context.js";
import { applyGenerateButtonStyle, applyImageFrameStyle, isThemeDark } from '../settings/theme.js';
import { debounce } from './utils.js';
import { processMesTextElements, processIframes, processRecentChats } from './chatProcessor.js';
import { setTriggerGeneration } from './dialogs.js';
import { triggerGeneration, setShowImagePreview } from './generation.js';
import { showImagePreview } from './imagePreview.js';

// 全局变量
let autoClickTimer = null;
window.zidongdianji = false;

// 设置循环依赖的函数引用
setTriggerGeneration(triggerGeneration);
setShowImagePreview(showImagePreview);

// 防抖版的处理函数，用于滚动事件
const debouncedProcessVisible = debounce(() => {
    processMesTextElements();
    processIframes();
}, 200);

// 事件监听：生成结束
eventSource.on(event_types.GENERATION_ENDED, async (data) => {
    window.zidongdianji = true;

    if (autoClickTimer) {
        clearTimeout(autoClickTimer);
    }

    if (!extension_settings[extensionName].zidongdianji2 === "true") {

        autoClickTimer = setTimeout(() => {
            window.zidongdianji = false;
            autoClickTimer = null;
        }, 5000);

    }
});

// 事件监听：消息滑动
eventSource.on(event_types.MESSAGE_SWIPED, async (data) => {
    window.zidongdianji = true;

    if (autoClickTimer) {
        clearTimeout(autoClickTimer);
    }

    if (!extension_settings[extensionName].zidongdianji2 === "true") {

        autoClickTimer = setTimeout(() => {
            window.zidongdianji = false;
            autoClickTimer = null;
        }, 5000);

    }
});

// 事件监听：JS 生成结束
eventSource.on("js_generation_ended", async (data) => {
    window.zidongdianji = true;

    if (autoClickTimer) {
        clearTimeout(autoClickTimer);
    }

    if (!extension_settings[extensionName].zidongdianji2 === "true") {

        autoClickTimer = setTimeout(() => {
            window.zidongdianji = false;
            autoClickTimer = null;
        }, 5000);

    }
});

/**
 * 处理所有图片占位符
 */
export function processAllImagePlaceholders() {
    // Process .mes_text elements in the main document
    processMesTextElements();

    // Process iframes separately
    processIframes();

    // New logic to process recent chats and add collapsible UI
    try {
        const context = getContext();
        if (context && Array.isArray(context.chat) && extension_settings[extensionName].heavyFrontendMode == "true") {
            processRecentChats(context.chat);
        }
    } catch (e) {
        console.error("st-chatu8: Error processing recent chats:", e);
    }
}

/**
 * Global listener for new iframes and main document mutations
 * 初始化图片处理
 */
export function initializeImageProcessing() {
    // Apply button style on init
    if (extension_settings[extensionName]) {
        const currentTheme = extension_settings[extensionName].themes?.[extension_settings[extensionName].theme_id] || {};
        applyGenerateButtonStyle(extension_settings[extensionName].generate_btn_style || '默认', isThemeDark(currentTheme));
        applyImageFrameStyle(extension_settings[extensionName].image_frame_style || '无样式', isThemeDark(currentTheme));
    }

    // Initial processing
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', processAllImagePlaceholders);
    } else {
        processAllImagePlaceholders();
    }
}
