// @ts-nocheck
/**
 * 对话框相关功能
 * 包含：标签编辑对话框、Banana 修图对话框
 */

import { saveSettingsDebounced } from "../../../../../../script.js";
import { extension_settings } from "../../../../../extensions.js";
import { extensionName } from '../config.js';
import { parsePromptStringWithCoordinates, stripChineseAnnotations } from '../utils.js';
import { callTranslation, parseTranslationResult, tagsToJsonString } from '../ai.js';
import { handleTagModifyRequest } from '../tagModify.js';
import { processCharacterPrompt } from '../characterprompt.js';
import { handleAutocomplete } from './autocomplete.js';
import { isMobileDevice } from '../utils.js';
import { lockTagForElement, unlockTagForElement, isTagLocked, deleteTagForElement } from '../imageInserter.js';

// 延迟导入，避免循环依赖
let _triggerGeneration = null;

/**
 * 设置 triggerGeneration 函数引用
 * @param {Function} fn - triggerGeneration 函数
 */
export function setTriggerGeneration(fn) {
    _triggerGeneration = fn;
}

/**
 * 获取当前模式的宽高配置键
 * @param {string} mode - 当前模式
 * @returns {{widthKey: string, heightKey: string, modeName: string}}
 */
function getImageSizeConfigKeys(mode) {
    const configMap = {
        'sd': { widthKey: 'sd_cwidth', heightKey: 'sd_cheight', modeName: 'SD' },
        'novelai': { widthKey: 'novelai_width', heightKey: 'novelai_height', modeName: 'NovelAI' },
        'comfyui': { widthKey: 'comfyui_width', heightKey: 'comfyui_height', modeName: 'ComfyUI' },
        'banana': { widthKey: null, heightKey: null, modeName: 'Banana' }
    };
    return configMap[mode] || configMap['comfyui'];
}

/**
 * 显示图片大小设置弹窗
 * @param {HTMLButtonElement} button - 生成按钮
 * @param {HTMLTextAreaElement} inputEl - tag 编辑框的输入框元素
 * @param {Function} onConfirm - 确认后的回调函数
 */
function showImageSizePopup(button, inputEl, onConfirm) {
    return new Promise((resolve) => {
        const doc = window.top.document;
        const isMobile = isMobileDevice();
        const settings = extension_settings[extensionName];
        const mode = settings.mode || 'comfyui';
        const { widthKey, heightKey, modeName } = getImageSizeConfigKeys(mode);

        // 读取大小：优先从按钮 dataset，否则从全局配置
        let currentWidth, currentHeight;

        if (mode === 'banana') {
            // Banana 模式使用 aspectRatio
            const aspectRatio = button.dataset.aspectRatio || settings.banana?.aspectRatio || '1:1';
            currentWidth = aspectRatio;
            currentHeight = '';
        } else {
            currentWidth = button.dataset.width || settings[widthKey] || '1024';
            currentHeight = button.dataset.height || settings[heightKey] || '1024';
            console.log('[showImageSizePopup] 读取配置:', {
                mode,
                widthKey,
                heightKey,
                buttonWidth: button.dataset.width,
                buttonHeight: button.dataset.height,
                configWidth: settings[widthKey],
                configHeight: settings[heightKey],
                currentWidth,
                currentHeight
            });
        }

        // 移动端：获取 top-settings-holder 和 send_form 的位置
        let topBound = 10;
        let bottomBound = window.innerHeight - 10;

        if (isMobile) {
            const topSettingsHolder = doc.querySelector('#top-settings-holder');
            if (topSettingsHolder) {
                const rect = topSettingsHolder.getBoundingClientRect();
                topBound = rect.bottom + 10;
            }
            const sendForm = doc.querySelector('#send_form');
            if (sendForm) {
                const rect = sendForm.getBoundingClientRect();
                bottomBound = rect.top - 10;
            }
        }

        const availableHeight = bottomBound - topBound;

        // 创建遮罩层
        const overlay = doc.createElement('div');
        overlay.id = 'image-size-overlay';
        overlay.className = 'st-chatu8-popup-overlay';

        // 创建气泡容器
        const bubble = doc.createElement('div');
        bubble.className = 'st-chatu8-popup-bubble';
        if (isMobile) {
            bubble.classList.add('mobile');
            bubble.style.top = `${topBound}px`;
            bubble.style.maxHeight = `${availableHeight}px`;
        }

        // 标题
        const title = doc.createElement('div');
        title.textContent = `📐 图片大小设置 (${modeName})`;
        title.className = 'st-chatu8-popup-title';

        // 提示文字
        const hint = doc.createElement('div');
        hint.textContent = mode === 'banana' ? '设置生成图片的纵横比' : '设置生成图片的宽度和高度';
        hint.className = 'st-chatu8-popup-hint';

        // 表单区域
        const formSection = doc.createElement('div');
        formSection.className = 'st-chatu8-popup-size-form';

        let widthInput, heightInput;

        if (mode === 'banana') {
            // Banana 模式：纵横比选择
            const ratioRow = doc.createElement('div');
            ratioRow.className = 'st-chatu8-popup-size-row';

            const ratioLabel = doc.createElement('label');
            ratioLabel.textContent = '纵横比';
            ratioLabel.className = 'st-chatu8-popup-size-label';

            const ratioSelect = doc.createElement('select');
            ratioSelect.className = 'st-chatu8-popup-size-input';
            ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].forEach(ratio => {
                const option = doc.createElement('option');
                option.value = ratio;
                option.textContent = ratio;
                if (ratio === currentWidth) option.selected = true;
                ratioSelect.appendChild(option);
            });

            ratioRow.appendChild(ratioLabel);
            ratioRow.appendChild(ratioSelect);
            formSection.appendChild(ratioRow);

            widthInput = ratioSelect;
        } else {
            // 宽度行
            const widthRow = doc.createElement('div');
            widthRow.className = 'st-chatu8-popup-size-row';

            const widthLabel = doc.createElement('label');
            widthLabel.textContent = '宽度';
            widthLabel.className = 'st-chatu8-popup-size-label';

            widthInput = doc.createElement('input');
            widthInput.type = 'number';
            widthInput.value = currentWidth;
            widthInput.min = '64';
            widthInput.max = '4096';
            widthInput.step = '64';
            widthInput.className = 'st-chatu8-popup-size-input';

            widthRow.appendChild(widthLabel);
            widthRow.appendChild(widthInput);

            // 高度行
            const heightRow = doc.createElement('div');
            heightRow.className = 'st-chatu8-popup-size-row';

            const heightLabel = doc.createElement('label');
            heightLabel.textContent = '高度';
            heightLabel.className = 'st-chatu8-popup-size-label';

            heightInput = doc.createElement('input');
            heightInput.type = 'number';
            heightInput.value = currentHeight;
            heightInput.min = '64';
            heightInput.max = '4096';
            heightInput.step = '64';
            heightInput.className = 'st-chatu8-popup-size-input';

            heightRow.appendChild(heightLabel);
            heightRow.appendChild(heightInput);

            // 对调按钮行
            const swapRow = doc.createElement('div');
            swapRow.className = 'st-chatu8-popup-size-row swap-row';

            const swapBtn = doc.createElement('button');
            swapBtn.type = 'button';
            swapBtn.innerHTML = '⇅ 对调宽高';
            swapBtn.className = 'st-chatu8-popup-swap-btn';
            swapBtn.onclick = () => {
                const temp = widthInput.value;
                widthInput.value = heightInput.value;
                heightInput.value = temp;
            };

            swapRow.appendChild(swapBtn);

            formSection.appendChild(widthRow);
            formSection.appendChild(heightRow);
            formSection.appendChild(swapRow);
        }

        // 按钮容器
        const buttonContainer = doc.createElement('div');
        buttonContainer.className = 'st-chatu8-popup-buttons';

        // 取消按钮
        const cancelBtn = doc.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.className = 'st-chatu8-popup-btn-cancel';

        // 确定按钮
        const confirmBtn = doc.createElement('button');
        confirmBtn.textContent = '确定并生成';
        confirmBtn.className = 'st-chatu8-popup-btn-confirm';

        // 关闭弹窗函数
        const closePopup = (result) => {
            overlay.classList.add('closing');
            setTimeout(() => {
                overlay.remove();
                resolve(result);
            }, 150);
        };

        // 绑定事件
        cancelBtn.addEventListener('click', () => closePopup(null));
        confirmBtn.addEventListener('click', () => {
            if (mode === 'banana') {
                button.dataset.aspectRatio = widthInput.value;
                closePopup({ aspectRatio: widthInput.value });
            } else {
                const newWidth = widthInput.value.trim();
                const newHeight = heightInput.value.trim();
                // 保存到按钮 dataset
                button.dataset.width = newWidth;
                button.dataset.height = newHeight;
                closePopup({ width: newWidth, height: newHeight });
            }
        });

        // ESC 键关闭
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                closePopup(null);
                doc.removeEventListener('keydown', handleKeydown);
            } else if (e.key === 'Enter') {
                confirmBtn.click();
                doc.removeEventListener('keydown', handleKeydown);
            }
        };
        doc.addEventListener('keydown', handleKeydown);

        // 组装元素
        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(confirmBtn);
        bubble.appendChild(title);
        bubble.appendChild(hint);
        bubble.appendChild(formSection);
        bubble.appendChild(buttonContainer);
        overlay.appendChild(bubble);
        doc.body.appendChild(overlay);

        // 自动聚焦第一个输入框
        setTimeout(() => widthInput?.focus(), 100);
    });
}

/**
 * 显示 Banana 修图专用对话框
 * @param {HTMLImageElement} originalImgElement - 聊天界面中的原始图片元素
 * @param {HTMLButtonElement} originalButton - 原始的"生成图片"按钮
 */
export function showBananaRetouchDialog(originalImgElement, originalButton) {
    const doc = window.top.document;
    const imageUrl = originalImgElement.src; // 获取当前图片

    // --- 清理旧的对话框 ---
    doc.querySelector('.st-chatu8-retouch-backdrop')?.remove();

    // --- 创建 UI 元素 ---
    const backdrop = doc.createElement('div');
    backdrop.className = 'st-chatu8-edit-backdrop st-chatu8-retouch-backdrop'; // 复用样式

    const dialog = doc.createElement('div');
    dialog.className = 'st-chatu8-edit-dialog'; // 复用样式
    dialog.addEventListener('click', (e) => e.stopPropagation());

    const title = doc.createElement('div');
    title.className = 'st-chatu8-edit-title';
    title.textContent = 'Banana 修图';

    // 图片预览
    const imagePreview = doc.createElement('img');
    imagePreview.src = imageUrl;
    imagePreview.style.display = 'block';
    imagePreview.style.maxWidth = '100%';
    imagePreview.style.maxHeight = '30vh';
    imagePreview.style.objectFit = 'contain';
    imagePreview.style.margin = '0 auto 15px auto';
    imagePreview.style.borderRadius = '8px';

    // 修图提示词输入框
    const input = doc.createElement('textarea');
    input.className = 'st-chatu8-edit-input';
    input.placeholder = '输入修图指令，例如："给人物换上红色的连衣裙"';

    // 还原上次的修图指令（从 dataset 中读取）
    if (originalButton.dataset.retouchPrompt) {
        input.value = originalButton.dataset.retouchPrompt;
    }

    const buttonContainer = doc.createElement('div');
    buttonContainer.className = 'st-chatu8-edit-buttons';

    const closeDialog = () => backdrop.remove();

    // 发送按钮
    const sendButton = doc.createElement('button');
    sendButton.className = 'st-chatu8-edit-button send';
    sendButton.textContent = '发送';
    sendButton.onclick = () => {
        const retouchPrompt = input.value.trim();
        if (!retouchPrompt) {
            toastr.warning('请输入修图指令。');
            return;
        }

        // 将修图指令和图片URL存储到 dataset 中，供 banana.js 读取
        originalButton.dataset.retouchPrompt = retouchPrompt;
        originalButton.dataset.retouchImage = imageUrl;

        // 将修图标记一起设置为 change 数据
        if (!originalButton.dataset.change) {
            originalButton.dataset.change = originalButton.dataset.link;
        }
        originalButton.dataset.change = `${originalButton.dataset.change}{修图}`;

        toastr.info('正在准备修图生成...');

        // 触发标准生成流程
        if (_triggerGeneration) {
            _triggerGeneration(originalButton);
        }

        // 关闭对话框
        closeDialog();
    };

    // 取消按钮
    const cancelButton = doc.createElement('button');
    cancelButton.className = 'st-chatu8-edit-button cancel';
    cancelButton.textContent = '取消';
    cancelButton.onclick = closeDialog;

    // --- 组装 UI ---
    buttonContainer.appendChild(sendButton);
    buttonContainer.appendChild(cancelButton);

    dialog.appendChild(title);
    dialog.appendChild(imagePreview);
    dialog.appendChild(input);
    dialog.appendChild(buttonContainer);

    backdrop.appendChild(dialog);
    doc.body.appendChild(backdrop);
    input.focus();
}


/**
 * 显示标签编辑对话框
 * @param {HTMLImageElement|HTMLVideoElement} img - 图片或视频元素
 * @param {HTMLButtonElement} button - 生成按钮元素
 */
export function showEditDialog(img, button) {
    const doc = window.top.document;
    const currentTag = button.dataset.change || button.dataset.link;

    // --- Inject Autocomplete CSS if not already present ---
    const styleId = 'st-chatu8-autocomplete-styles';
    if (!doc.getElementById(styleId)) {
        const style = doc.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            /* Dialog Styles - scoped to edit backdrop */
            .st-chatu8-edit-backdrop .st-chatu8-edit-dialog {
                background-color: var(--st-chatu8-bg-primary);
                color: var(--st-chatu8-text-primary);
                border: 1px solid var(--st-chatu8-border-color);
                box-shadow: 0 8px 24px rgba(0,0,0,0.2);
                border-radius: 12px;
                padding: 20px;
                resize: both;
                overflow: auto;
                min-width: 300px;
                min-height: 200px;
                max-width: 90vw;
                max-height: 85vh;
                display: flex;
                flex-direction: column;
            }
            .st-chatu8-edit-backdrop .st-chatu8-edit-title {
                color: var(--st-chatu8-text-primary);
                font-size: 1.2em;
                font-weight: bold;
                margin-bottom: 15px;
            }
            .st-chatu8-edit-backdrop .st-chatu8-edit-input {
                background-color: var(--st-chatu8-input-bg);
                color: var(--st-chatu8-input-text);
                border: 1px solid var(--st-chatu8-input-border);
                border-radius: 6px;
                padding: 10px;
                width: 100%;
                box-sizing: border-box;
                min-height: 100px;
                flex: 1 1 auto;
                resize: both;
            }
            .st-chatu8-edit-backdrop .st-chatu8-edit-buttons {
                margin-top: 15px;
                display: flex;
                justify-content: center;
                flex-wrap: wrap;
                gap: 8px;
            }
            .st-chatu8-edit-backdrop .st-chatu8-edit-button {
                border-radius: 6px;
                padding: 6px 12px;
                font-weight: bold;
                cursor: pointer;
                border: none;
                font-size: 0.9em;
                white-space: nowrap;
            }
            .st-chatu8-edit-backdrop .st-chatu8-edit-button.send {
                background-color: var(--st-chatu8-accent-primary);
                color: white;
            }
            .st-chatu8-edit-backdrop .st-chatu8-edit-button.cancel {
                background-color: var(--st-chatu8-bg-secondary);
                color: var(--st-chatu8-text-secondary);
            }

            /* Autocomplete Styles - scoped to edit backdrop only */
            .st-chatu8-edit-backdrop .ch-autocomplete-results {
                display: none;
                position: absolute;
                background-color: var(--st-chatu8-dropdown-list-bg);
                border: 1px solid var(--st-chatu8-border-color);
                border-radius: 6px;
                max-height: 150px;
                overflow-y: auto;
                z-index: 10;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                max-width: 100%;
            }
            .st-chatu8-edit-backdrop .ch-autocomplete-item {
                padding: 8px 12px;
                cursor: pointer;
                color: var(--st-chatu8-dropdown-text);
                font-size: 0.9em;
            }
            .st-chatu8-edit-backdrop .ch-autocomplete-item:hover {
                background-color: var(--st-chatu8-accent-secondary);
                color: var(--st-chatu8-text-highlight);
            }
        `;
        doc.head.appendChild(style);
    }
    // --- End CSS Injection ---

    // --- Cleanup any previous instances ---
    doc.querySelector('.st-chatu8-edit-backdrop')?.remove();
    // No need to remove .ch-autocomplete-results separately, it's inside the backdrop.

    // --- Autocomplete Results Element ---
    const resultsEl = doc.createElement('div');
    resultsEl.className = 'ch-autocomplete-results';
    // Position is now handled by CSS

    // --- Helper Functions ---
    let originalDialogHeight = null; // 记录对话框原始高度

    const expandDialogForAutocomplete = () => {
        // Unnatural resizing bug fix: Disable auto-expansion on desktop
        return;
    };

    const restoreDialogSize = () => {
        // Unnatural resizing bug fix: Disable auto-restoration on desktop
        return;
    };

    // 将恢复函数挂载到resultsEl上，方便handleResultClick调用
    resultsEl.restoreDialogSize = restoreDialogSize;

    const updateResultsPosition = () => {
        if (resultsEl.style.display === 'none') {
            restoreDialogSize();
            return;
        }
        // Position relative to the dialog, not the viewport
        resultsEl.style.top = `${input.offsetTop + input.offsetHeight + 2}px`; // 2px gap below input
        resultsEl.style.left = `${input.offsetLeft}px`;
        resultsEl.style.width = `${input.offsetWidth}px`;
        // 扩展对话框以容纳autocomplete
        expandDialogForAutocomplete();
    };

    const closeDialog = () => {
        // No need to remove window listeners if they are not added
        backdrop.remove();
    };

    // --- Create UI Elements ---
    const backdrop = doc.createElement('div');
    backdrop.className = 'st-chatu8-edit-backdrop';
    // backdrop.addEventListener('click', closeDialog); // Removed to prevent closing on outside click

    const dialog = doc.createElement('div');
    dialog.className = 'st-chatu8-edit-dialog';
    dialog.style.position = 'relative'; // Crucial for child absolute positioning
    dialog.addEventListener('click', (e) => e.stopPropagation());

    const isMobile = window.top.innerWidth <= 768;
    // 动态设置对话框最大高度：以 #send_textarea 的顶部为底边界
    const sendTextarea = doc.querySelector('#send_textarea');
    let topMargin = 10;

    if (isMobile) {
        const topButton = /** @type {HTMLElement | null} */ (window.top.document.querySelector('#ai-config-button'));
        topMargin = (topButton?.offsetHeight || 0) + 10;
        backdrop.style.alignItems = 'flex-start';
        dialog.style.marginTop = `${topMargin}px`;
    }

    if (sendTextarea) {
        const sendTextareaRect = sendTextarea.getBoundingClientRect();
        const maxHeight = sendTextareaRect.top - topMargin - 20; // 留出间距
        dialog.style.maxHeight = `${maxHeight}px`;
        dialog.style.overflowY = 'auto';

        // 手机端默认使用最大高度，避免 tag 太少时对话框吊在屏幕上方
        if (isMobile) {
            dialog.style.height = `${maxHeight}px`;
        }
    }

    const title = doc.createElement('div');
    title.className = 'st-chatu8-edit-title';
    title.textContent = '编辑图片标签';

    const input = doc.createElement('textarea');
    input.id = 'st-chatu8-edit-input';
    input.className = 'st-chatu8-edit-input';
    input.value = currentTag;

    const buttonContainer = doc.createElement('div');
    buttonContainer.className = 'st-chatu8-edit-buttons';

    // Tag操作入口按钮（下拉菜单）
    const tagActionsContainer = doc.createElement('div');
    tagActionsContainer.className = 'st-chatu8-tag-actions-container';
    tagActionsContainer.style.cssText = 'position: relative; display: inline-block;';

    const tagActionsButton = doc.createElement('button');
    tagActionsButton.className = 'st-chatu8-edit-button send';
    tagActionsButton.textContent = 'Tag操作 ▼';
    tagActionsButton.type = 'button';

    // 下拉菜单
    const tagActionsMenu = doc.createElement('div');
    tagActionsMenu.className = 'st-chatu8-tag-actions-menu';
    tagActionsMenu.style.cssText = `
        display: none;
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        margin-bottom: 8px;
        background-color: var(--st-chatu8-bg-primary, #2a2a2a);
        border: 1px solid var(--st-chatu8-border-color, #444);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        padding: 8px;
        z-index: 100;
        min-width: 120px;
        flex-direction: column;
        gap: 6px;
    `;

    // 重置tag按钮
    const resetButton = doc.createElement('button');
    resetButton.className = 'st-chatu8-tag-action-item';
    resetButton.innerHTML = '🔄 重置tag';
    resetButton.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 8px 12px;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: var(--st-chatu8-text-primary, #fff);
        cursor: pointer;
        font-size: 0.9em;
        text-align: left;
        transition: background-color 0.2s ease;
    `;
    resetButton.onmouseenter = () => {
        resetButton.style.backgroundColor = 'var(--st-chatu8-accent-secondary, #3a3a3a)';
    };
    resetButton.onmouseleave = () => {
        resetButton.style.backgroundColor = 'transparent';
    };
    resetButton.onclick = () => {
        input.value = button.dataset.link;
        tagActionsMenu.style.display = 'none';
        toastr.success('Tag已重置');
    };

    // 锁定tag按钮
    const lockTagButton = doc.createElement('button');
    lockTagButton.className = 'st-chatu8-tag-action-item';
    lockTagButton.innerHTML = '🔒 锁定tag';
    lockTagButton.style.cssText = resetButton.style.cssText;
    lockTagButton.onmouseenter = () => {
        lockTagButton.style.backgroundColor = 'var(--st-chatu8-accent-secondary, #3a3a3a)';
    };
    lockTagButton.onmouseleave = () => {
        lockTagButton.style.backgroundColor = 'transparent';
    };
    lockTagButton.onclick = async () => {
        tagActionsMenu.style.display = 'none';

        // 获取当前 tag（优先使用原始 tag）
        const currentTag = button.dataset.link;
        if (!currentTag) {
            toastr.warning('未找到 tag');
            return;
        }

        // 找到按钮的父元素（用于定位存储位置）
        let contextEl = button;
        while (contextEl && contextEl.tagName !== 'DIV') {
            contextEl = contextEl.parentElement;
        }
        const mesText = contextEl?.closest('.mes_text') || contextEl;

        // 检查当前锁定状态
        const isLocked = await isTagLocked(mesText, currentTag);

        if (isLocked) {
            // 当前已锁定，执行解锁
            const result = await unlockTagForElement(mesText, currentTag);
            if (result.success) {
                toastr.success('Tag 已解锁');
                lockTagButton.innerHTML = '🔒 锁定tag';
            } else {
                toastr.warning(result.message);
            }
        } else {
            // 当前未锁定，执行锁定
            const result = await lockTagForElement(mesText, currentTag);
            if (result.success) {
                toastr.success('Tag 已锁定，将不会被覆盖或删除');
                lockTagButton.innerHTML = '🔓 解锁tag';
            } else {
                toastr.warning(result.message);
            }
        }
    };

    // 删除tag按钮
    const deleteTagButton = doc.createElement('button');
    deleteTagButton.className = 'st-chatu8-tag-action-item';
    deleteTagButton.innerHTML = '🗑️ 删除tag';
    deleteTagButton.style.cssText = resetButton.style.cssText;
    deleteTagButton.style.color = '#ff6b6b'; // 红色提示删除
    deleteTagButton.onmouseenter = () => {
        deleteTagButton.style.backgroundColor = 'rgba(255, 107, 107, 0.15)';
    };
    deleteTagButton.onmouseleave = () => {
        deleteTagButton.style.backgroundColor = 'transparent';
    };
    deleteTagButton.onclick = async () => {
        tagActionsMenu.style.display = 'none';

        // 获取当前 tag（优先使用原始 tag）
        const currentTag = button.dataset.link;
        if (!currentTag) {
            toastr.warning('未找到 tag');
            return;
        }

        // 找到按钮的父元素（用于定位存储位置）
        let contextEl = button;
        while (contextEl && contextEl.tagName !== 'DIV') {
            contextEl = contextEl.parentElement;
        }
        const mesText = contextEl?.closest('.mes_text') || contextEl;

        // 调用删除函数
        const result = await deleteTagForElement(mesText, currentTag);
        if (result.success) {
            // 删除页面上相关的 DOM 元素
            // 向上查找 st-chatu8-collapse-wrapper 或 st-chatu8-image-span 容器并删除
            let containerToRemove = button.closest('.st-chatu8-collapse-wrapper');
            if (!containerToRemove) {
                containerToRemove = button.closest('.st-chatu8-image-span');
            }
            if (!containerToRemove) {
                containerToRemove = button.closest('.st-chatu8-image-container');
            }
            if (containerToRemove) {
                containerToRemove.remove();
                console.log('[dialogs] Removed DOM container for deleted tag');
            } else {
                // 没有找到容器，直接删除按钮本身
                button.remove();
                console.log('[dialogs] Removed button for deleted tag');
            }

            toastr.success(result.message);
            closeDialog();
        } else {
            toastr.warning(result.message);
        }
    };

    // 组装下拉菜单
    tagActionsMenu.appendChild(resetButton);
    tagActionsMenu.appendChild(lockTagButton);
    tagActionsMenu.appendChild(deleteTagButton);

    // 点击按钮切换菜单显示
    tagActionsButton.onclick = (e) => {
        e.stopPropagation();
        const isVisible = tagActionsMenu.style.display === 'flex';
        tagActionsMenu.style.display = isVisible ? 'none' : 'flex';
    };

    // 点击其他地方关闭菜单
    doc.addEventListener('click', (e) => {
        if (!tagActionsContainer.contains(e.target)) {
            tagActionsMenu.style.display = 'none';
        }
    }, { once: false });

    tagActionsContainer.appendChild(tagActionsButton);
    tagActionsContainer.appendChild(tagActionsMenu);

    // 翻译按钮：在"重置tag"旁边
    const translateButton = doc.createElement('button');
    translateButton.className = 'st-chatu8-edit-button send';
    translateButton.textContent = '翻译';
    translateButton.onclick = async () => {
        try {
            translateButton.disabled = true;

            const originalVal = input.value || '';
            // 清理旧中文注释并统一分隔符
            const cleaned = stripChineseAnnotations(originalVal).replace(/，/g, ',').replace(/[\r\n]+/g, ',');

            // 智能分割函数，保护 $...$ 包裹的标记不被拆分
            const smartSplitForTranslation = (text) => {
                const result = [];
                let current = '';
                let insideDollar = false;
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    if (char === '$') {
                        insideDollar = !insideDollar;
                        current += char;
                    } else if ((char === ',' || char === '，') && !insideDollar) {
                        const trimmed = current.trim();
                        if (trimmed) result.push(trimmed);
                        current = '';
                    } else {
                        current += char;
                    }
                }
                if (current.trim()) result.push(current.trim());
                return result;
            };

            // 检查标签是否应该跳过翻译（$...$ 包裹的角色/服装预设）
            const shouldSkipTag = (tag) => {
                return tag.startsWith('$') && tag.endsWith('$');
            };

            // 组装待翻译的英文标签列表
            let tokens = [];
            if (cleaned.includes('Scene Composition')) {
                // 分角色提示词：用 utils.parsePromptStringWithCoordinates 解析
                const parsed = parsePromptStringWithCoordinates(cleaned);
                const keys = [
                    'Scene Composition',
                    'Character 1 Prompt', 'Character 1 UC',
                    'Character 2 Prompt', 'Character 2 UC',
                    'Character 3 Prompt', 'Character 3 UC',
                    'Character 4 Prompt', 'Character 4 UC'
                ];
                keys.forEach(k => {
                    const v = parsed?.[k];
                    if (typeof v === 'string' && v.trim()) {
                        // 使用智能分割，保护 $...$ 标签
                        smartSplitForTranslation(v).forEach(t => {
                            // 跳过 $...$ 包裹的标签（角色/服装预设）
                            if (t && !shouldSkipTag(t)) {
                                tokens.push(t);
                            }
                        });
                    }
                });
            } else {
                // 普通模式 - 智能分割，保护 $...$ 包裹的标记不被拆分
                tokens = [];
                let currentToken = '';
                let insideDollar = false;

                for (let i = 0; i < cleaned.length; i++) {
                    const char = cleaned[i];

                    if (char === '$') {
                        insideDollar = !insideDollar;
                        currentToken += char;
                    } else if (char === ',' && !insideDollar) {
                        // 只在 $...$ 外部分割
                        const trimmed = currentToken.trim();
                        if (trimmed) tokens.push(trimmed);
                        currentToken = '';
                    } else {
                        currentToken += char;
                    }
                }
                // 处理最后一个 token
                const lastToken = currentToken.trim();
                if (lastToken) tokens.push(lastToken);

                // 过滤掉 $...$ 包裹的标记（这些是角色/服装预设，不需要翻译）
                tokens = tokens.filter(t => !t.startsWith('$') || !t.endsWith('$'));
            }

            // 去重
            tokens = Array.from(new Set(tokens));
            if (tokens.length === 0) {
                toastr.info('没有可翻译的标签。');
                translateButton.disabled = false;
                return;
            }

            // 清理符号函数：移除 {}[]() 和权重数字
            const cleanTagForTranslation = (tag) => {
                return tag
                    .replace(/^[\{\[\(\<]+|[\}\]\)\>]+$/g, '')  // 移除首尾的括号
                    .replace(/^\{+|\}+$/g, '')  // 再次确保移除花括号
                    .replace(/:[\d.]+$/, '')  // 移除末尾权重如 :0.8
                    .trim();
            };

            // 创建原始 tag 到清理后 tag 的映射
            const cleanedTokensForAI = [];
            for (const t of tokens) {
                const cleanedTag = cleanTagForTranslation(t);
                if (cleanedTag) {
                    cleanedTokensForAI.push(cleanedTag);
                }
            }

            // 使用清理后的 token 发送给 AI
            const textToTranslate = tagsToJsonString(Array.from(new Set(cleanedTokensForAI)));

            // 发起翻译请求（使用翻译设置中的 translation_model 与 translation_system_prompt）
            const resp = await callTranslation(textToTranslate);

            // 解析翻译结果（支持 JSON 格式和旧格式）
            const map = parseTranslationResult(resp);
            console.log('[翻译调试] 解析后的 map:', map);

            // 使用智能分割函数分割原始内容，保护 $...$ 标记
            const smartSplit = (text) => {
                const result = [];
                let current = '';
                let insideDollar = false;
                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    if (char === '$') {
                        insideDollar = !insideDollar;
                        current += char;
                    } else if (char === ',' && !insideDollar) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                if (current.trim()) result.push(current.trim());
                return result;
            };

            const originalTokens = smartSplit(cleaned);
            console.log('[翻译调试] originalTokens:', originalTokens);

            const annotatedTokens = originalTokens.map(t => {
                // 跳过 $...$ 包裹的标记（角色/服装预设）
                if (t.startsWith('$') && t.endsWith('$')) {
                    return t;
                }
                // 用清理后的 key 去匹配
                const cleanedKey = cleanTagForTranslation(t);
                if (map[cleanedKey]) {
                    console.log('[翻译调试] 匹配成功:', t, '(清理后:', cleanedKey, ') ->', map[cleanedKey]);
                    return `${t}（${map[cleanedKey]}）`;
                }
                // 也尝试直接匹配
                if (map[t]) {
                    console.log('[翻译调试] 直接匹配成功:', t, '->', map[t]);
                    return `${t}（${map[t]}）`;
                }
                console.log('[翻译调试] 未匹配:', t, '(清理后:', cleanedKey, ')');
                return t;
            });
            let annotated = annotatedTokens.join(', ');
            console.log('[翻译调试] annotated:', annotated);

            // 检测 NovelAI 分角色格式，在关键词前添加换行符提高可读性
            const novelaiKeywords = [
                'Scene Composition:',
                'Character 1 Prompt:', 'Character 1 UC:', 'Character 1 coordinates:',
                'Character 2 Prompt:', 'Character 2 UC:', 'Character 2 coordinates:',
                'Character 3 Prompt:', 'Character 3 UC:', 'Character 3 coordinates:',
                'Character 4 Prompt:', 'Character 4 UC:', 'Character 4 coordinates:'
            ];
            const hasNovelAIFormat = novelaiKeywords.some(kw => annotated.includes(kw));
            if (hasNovelAIFormat) {
                for (const keyword of novelaiKeywords) {
                    // 在关键词前添加换行，但避免在开头添加多余换行
                    annotated = annotated.replace(new RegExp(`(?<!^)\\s*${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), `\n\n${keyword}`);
                }
                // 清理可能产生的多余空白
                annotated = annotated.replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n');
            }

            input.value = annotated;
            toastr.success('翻译完成');
        } catch (e) {
            console.error('编辑标签翻译失败:', e);
            alert(`翻译失败：${e.message || e}`);
        } finally {
            translateButton.disabled = false;
        }
    };

    const sendButton = doc.createElement('button');
    sendButton.className = 'st-chatu8-edit-button send';
    sendButton.textContent = '发送';

    // 长按功能变量
    let sendPressTimer = null;
    let sendIsLongPress = false;
    const LONG_PRESS_DURATION = 500; // 长按触发时间（毫秒）

    // 执行发送逻辑的函数
    const doSend = () => {
        toastr.info('正在生成图像...');
        const newTag = input.value.trim();
        if (newTag && newTag !== currentTag) {
            button.dataset.change = newTag;
        }
        if (_triggerGeneration) {
            _triggerGeneration(button);
        }
        closeDialog();
    };

    // 长按处理：显示图片大小设置弹窗
    const handleLongPress = async () => {
        sendIsLongPress = true;
        const result = await showImageSizePopup(button, input);
        if (result) {
            // 用户点击了确定，执行发送
            doSend();
        }
        // 如果是取消，什么也不做
    };

    // 鼠标事件
    sendButton.addEventListener('mousedown', (e) => {
        sendIsLongPress = false;
        sendPressTimer = setTimeout(handleLongPress, LONG_PRESS_DURATION);
    });

    sendButton.addEventListener('mouseup', () => {
        clearTimeout(sendPressTimer);
        if (!sendIsLongPress) {
            doSend();
        }
    });

    sendButton.addEventListener('mouseleave', () => {
        clearTimeout(sendPressTimer);
    });

    // 触摸事件（移动端支持）
    sendButton.addEventListener('touchstart', (e) => {
        sendIsLongPress = false;
        sendPressTimer = setTimeout(handleLongPress, LONG_PRESS_DURATION);
    }, { passive: true });

    sendButton.addEventListener('touchend', (e) => {
        clearTimeout(sendPressTimer);
        if (!sendIsLongPress) {
            e.preventDefault(); // 防止触发 click
            doSend();
        }
    });

    sendButton.addEventListener('touchcancel', () => {
        clearTimeout(sendPressTimer);
    });

    const cancelButton = doc.createElement('button');
    cancelButton.className = 'st-chatu8-edit-button cancel';
    cancelButton.textContent = '取消';
    cancelButton.onclick = closeDialog;

    const bananaRetouchButton = doc.createElement('button');
    bananaRetouchButton.className = 'st-chatu8-edit-button send'; // 复用样式
    bananaRetouchButton.textContent = 'banana修图';
    bananaRetouchButton.onclick = () => {
        // 调用新的修图对话框函数，并将当前图片和原始按钮传递过去
        showBananaRetouchDialog(img, button);
        // 关闭当前的标签编辑对话框
        closeDialog();
    };

    // 修改tag按钮
    const modifyTagButton = doc.createElement('button');
    modifyTagButton.className = 'st-chatu8-edit-button send';
    modifyTagButton.textContent = '修改tag';
    modifyTagButton.onclick = async () => {
        // 向上查找父级 div 元素
        let targetEl = button;
        while (targetEl && targetEl.tagName !== 'DIV') {
            targetEl = targetEl.parentElement;
        }
        // 继续向上查找 mes_text
        if (targetEl) {
            const mesText = targetEl.closest('.mes_text');
            if (mesText) {
                targetEl = mesText;
            }
        }
        if (targetEl) {
            await handleTagModifyRequest(targetEl, input.value, input);
        } else {
            toastr.warning('无法找到上下文元素');
        }
    };

    // 展开预设按钮：将角色/服装标记替换为实际 tag
    const expandPresetButton = doc.createElement('button');
    expandPresetButton.className = 'st-chatu8-edit-button send';
    expandPresetButton.textContent = '展开预设';
    expandPresetButton.onclick = () => {
        const originalValue = input.value;
        const processedValue = processCharacterPrompt(originalValue);
        if (processedValue !== originalValue) {
            input.value = processedValue;
            toastr.success('角色/服装预设已展开');
        } else {
            toastr.info('未发现可展开的预设标记');
        }
    };

    // --- Assemble UI and Append to DOM ---
    buttonContainer.appendChild(tagActionsContainer);
    buttonContainer.appendChild(translateButton);
    buttonContainer.appendChild(expandPresetButton); // 添加展开预设按钮
    buttonContainer.appendChild(modifyTagButton); // 添加修改tag按钮
    buttonContainer.appendChild(bananaRetouchButton); // 添加新按钮
    buttonContainer.appendChild(sendButton);
    buttonContainer.appendChild(cancelButton);

    dialog.appendChild(title);
    dialog.appendChild(input);
    dialog.appendChild(buttonContainer);
    dialog.appendChild(resultsEl); // Append results directly to the dialog

    backdrop.appendChild(dialog);
    doc.body.appendChild(backdrop);
    input.focus();

    // Auto-adjust height based on content, respecting the CSS min/max vh values
    setTimeout(() => {
        input.style.height = 'auto'; // Reset to get accurate scrollHeight
        input.style.height = `${input.scrollHeight + 5}px`; // Set to content height + a small buffer
    }, 0);

    // --- Autocomplete Event Handling ---
    input.addEventListener('input', () => {
        // Live replace full-width comma with half-width comma for better user experience
        const originalValue = input.value;
        const newValue = originalValue.replace(/，/g, ',');
        if (originalValue !== newValue) {
            const selectionStart = input.selectionStart;
            input.value = newValue;
            // Restore cursor position after replacement
            input.setSelectionRange(selectionStart, selectionStart);
        }

        // Run search and then update position once results are ready to be shown
        handleAutocomplete(input, resultsEl).then(() => {
            updateResultsPosition();
        });
    });
    input.addEventListener('click', (event) => event.stopPropagation());

    // Hide results when input loses focus, unless clicking on a result item
    input.addEventListener('blur', () => {
        // Delay hiding to allow the 'mousedown' event on a result item to fire first
        setTimeout(() => {
            if (!resultsEl.matches(':hover')) {
                resultsEl.style.display = 'none';
                updateResultsPosition(); // 恢复对话框大小
            }
        }, 150);
    });

    // Since positioning is relative to the dialog, we might not need these listeners.
    // Let's remove them to simplify and prevent incorrect positioning on window scroll.
    // updateResultsPosition(); // Initial position
}
