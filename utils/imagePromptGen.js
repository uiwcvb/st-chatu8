// @ts-nocheck
/**
 * imagePromptGen.js - 图片提示词生成模块
 * 
 * 用于生成角色的图片提示词
 * 使用 LLM_CHAR_DISPLAY 类型的请求
 * 提供角色本身信息和详细的衣服信息
 * 不需要上下文、世界书和变量
 */

import { eventSource } from "../../../../../script.js";
import { eventNames, extensionName } from './config.js';
import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";
import { updateCombinedPrompt } from './settings/llm.js';
import { buildPromptForRequestType } from './settings/llmService.js';
import { stylishConfirm } from './ui_common.js';
import { mergeAdjacentMessages, replacePlaceholder as replaceOnePlaceholder } from './promptProcessor.js';

/**
 * 生成请求 ID
 * @returns {string}
 */
function generateRequestId() {
    if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * 获取角色/服装展示的提示词
 * @returns {Promise<Array>} 消息数组
 */
export function LLM_CHAR_DISPLAY_GET_PROMPT() {
    return new Promise((resolve, reject) => {
        const promptRequestId = generateRequestId();
        console.log(`[imagePromptGen] 请求获取角色/服装展示提示词 (ID: ${promptRequestId})`);

        const handler = (promptData) => {
            if (promptData.id !== promptRequestId) return;

            eventSource.removeListener(eventNames.LLM_CHAR_DISPLAY_GET_PROMPT_RESPONSE, handler);

            const { prompt } = promptData;
            console.log(`[imagePromptGen] 已获取角色/服装展示提示词 (ID: ${promptRequestId}):`, prompt);

            resolve(prompt);
        };

        eventSource.on(eventNames.LLM_CHAR_DISPLAY_GET_PROMPT_RESPONSE, handler);
        eventSource.emit(eventNames.LLM_CHAR_DISPLAY_GET_PROMPT_REQUEST, { id: promptRequestId });

        setTimeout(() => {
            eventSource.removeListener(eventNames.LLM_CHAR_DISPLAY_GET_PROMPT_RESPONSE, handler);
            reject(new Error("获取角色/服装展示提示词超时"));
        }, 10000);
    });
}

/**
 * 执行角色/服装展示 LLM 请求
 * @param {Array} prompt - 消息数组
 * @param {Object} options - 选项
 * @returns {Promise<string>} LLM 输出
 */
export function LLM_CHAR_DISPLAY(prompt, options = {}) {
    return new Promise((resolve, reject) => {
        const requestId = generateRequestId();
        const timeoutMs = options.timeoutMs || 180000;
        let timeoutTimer = null;

        console.log(`[imagePromptGen] 执行角色/服装展示 LLM 请求 (ID: ${requestId})`);

        const cleanup = () => {
            eventSource.removeListener(eventNames.LLM_CHAR_DISPLAY_RESPONSE, handler);
            if (timeoutTimer) {
                clearTimeout(timeoutTimer);
                timeoutTimer = null;
            }
        };

        const handler = (responseData) => {
            if (responseData.id !== requestId) return;
            cleanup();

            if (responseData.success) {
                resolve(responseData.result);
            } else {
                reject(new Error(responseData.result || 'LLM 请求失败'));
            }
        };

        eventSource.on(eventNames.LLM_CHAR_DISPLAY_RESPONSE, handler);
        eventSource.emit(eventNames.LLM_CHAR_DISPLAY_REQUEST, { prompt, id: requestId });

        timeoutTimer = setTimeout(() => {
            cleanup();
            reject(new Error("角色/服装展示 LLM 请求超时"));
        }, timeoutMs);
    });
}

/**
 * 替换占位符函数
 * @param {*} obj - 要处理的对象（可以是字符串、数组或对象）
 * @param {string} placeholder - 占位符
 * @param {*} value - 替换的值
 * @param {Set} replacedSet - 记录已替换的变量集合
 * @returns {*} 替换后的对象
 */
function replacePlaceholder(obj, placeholder, value, replacedSet) {
    // 1. 如果是字符串，直接替换
    if (typeof obj === 'string') {
        if (value && obj.includes(placeholder)) {
            if (replacedSet) {
                replacedSet.add(placeholder);
            }
        }
        return obj.replaceAll(placeholder, value);
    }

    // 2. 如果是数组，遍历每个元素递归处理
    if (Array.isArray(obj)) {
        return obj.map(item => replacePlaceholder(item, placeholder, value, replacedSet));
    }

    // 3. 如果是对象，遍历每个属性递归处理
    if (obj && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            newObj[key] = replacePlaceholder(obj[key], placeholder, value, replacedSet);
        }
        return newObj;
    }

    // 4. 其他类型（数字、布尔等）原样返回
    return obj;
}

/**
 * 获取当前角色预设数据
 */
function getCurrentCharacterPreset() {
    const settings = extension_settings[extensionName];
    const presetId = settings.characterPresetId;

    if (!presetId || !settings.characterPresets[presetId]) {
        return null;
    }

    return {
        id: presetId,
        data: settings.characterPresets[presetId]
    };
}

/**
 * 构建当前角色的文本表示
 */
function buildCharacterText(preset) {
    const data = preset.data;
    let text = '<人物>\n';
    text += `中文名称: ${data.nameCN || ''}\n`;
    text += `英文名称: ${data.nameEN || ''}\n`;
    text += `五官外貌: ${data.facialFeatures || ''}\n`;
    text += `五官外貌背面: ${data.facialFeaturesBack || ''}\n`;
    text += `上半身SFW: ${data.upperBodySFW || ''}\n`;
    text += `上半身SFW背面: ${data.upperBodySFWBack || ''}\n`;
    text += `下半身SFW: ${data.fullBodySFW || ''}\n`;
    text += `下半身SFW背面: ${data.fullBodySFWBack || ''}\n`;
    text += `上半身NSFW: ${data.upperBodyNSFW || ''}\n`;
    text += `上半身NSFW背面: ${data.upperBodyNSFWBack || ''}\n`;
    text += `下半身NSFW: ${data.fullBodyNSFW || ''}\n`;
    text += `下半身NSFW背面: ${data.fullBodyNSFWBack || ''}\n`;
    text += '</人物>';
    return text;
}

/**
 * 构建角色服装的文本表示
 * 根据角色预设中的 outfits 列表获取详细的服装信息
 */
function buildOutfitsText(preset) {
    const settings = extension_settings[extensionName];
    const outfitNames = preset.data.outfits || [];

    if (outfitNames.length === 0) {
        return '<服装列表>\n(无服装)\n</服装列表>';
    }

    let text = '<服装列表>\n';

    for (const outfitName of outfitNames) {
        const outfitPreset = settings.outfitPresets[outfitName];
        if (outfitPreset) {
            text += `<服装>\n`;
            text += `服装名称: ${outfitName}\n`;
            text += `中文名称: ${outfitPreset.nameCN || ''}\n`;
            text += `英文名称: ${outfitPreset.nameEN || ''}\n`;
            text += `上半身: ${outfitPreset.upperBody || ''}\n`;
            text += `上半身背面: ${outfitPreset.upperBodyBack || ''}\n`;
            text += `下半身: ${outfitPreset.fullBody || ''}\n`;
            text += `下半身背面: ${outfitPreset.fullBodyBack || ''}\n`;
            text += `</服装>\n`;
        } else {
            text += `<服装>\n`;
            text += `服装名称: ${outfitName}\n`;
            text += `(找不到该服装预设)\n`;
            text += `</服装>\n`;
        }
    }

    text += '</服装列表>';
    return text;
}

/**
 * 从 LLM 输出中提取图片提示词
 * 解析策略：
 * 1. 优先查找 <images>...</images> 包裹块
 * 2. 在 <images> 块内查找所有 <image>...</image> 标签
 * 3. 如果没有找到 <images>/<image> 结构，回退到 image###...### 格式
 * 
 * @param {string} text - LLM 输出文本
 * @returns {string|Array<string>} 提取出的提示词（单个或数组），如果没有找到返回空字符串
 */
function extractImagePrompt(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    // 0. 先移除 <thinking>...</thinking> 标签及其内容
    text = text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();

    // 1. 优先尝试提取 <images>...</images> 块
    const imagesBlockRegex = /<images>([\s\S]*?)<\/images>/i;
    const imagesBlockMatch = text.match(imagesBlockRegex);

    if (imagesBlockMatch && imagesBlockMatch[1]) {
        const imagesContent = imagesBlockMatch[1];
        console.log('[imagePromptGen] Found <images> block:', imagesContent.substring(0, 100) + '...');

        // 2. 在 <images> 块内查找所有 <image>...</image> 标签
        const imageTagRegex = /<image>([\s\S]*?)<\/image>/gi;
        const extractedPrompts = [];
        let imageMatch;

        while ((imageMatch = imageTagRegex.exec(imagesContent)) !== null) {
            const imageContent = imageMatch[1];

            // 在 <image> 标签内解析 image###...### 格式
            const innerPromptRegex = /image###([\s\S]*?)###/;
            const innerMatch = imageContent.match(innerPromptRegex);

            if (innerMatch && innerMatch[1]) {
                const prompt = innerMatch[1].trim();
                if (prompt) {
                    extractedPrompts.push(prompt);
                    console.log('[imagePromptGen] Extracted image###...### from <image>:', prompt.substring(0, 50) + '...');
                }
            } else {
                // 如果没有 image###...### 格式，直接使用 <image> 标签内容
                const fallbackPrompt = imageContent.trim();
                if (fallbackPrompt) {
                    extractedPrompts.push(fallbackPrompt);
                    console.log('[imagePromptGen] Using <image> content directly:', fallbackPrompt.substring(0, 50) + '...');
                }
            }
        }

        if (extractedPrompts.length > 0) {
            // 如果只有一个，返回字符串；否则返回数组
            return extractedPrompts.length === 1 ? extractedPrompts[0] : extractedPrompts;
        }

        // 如果 <images> 块内没有找到 <image> 标签，尝试直接使用块内容
        const trimmedContent = imagesContent.trim();
        if (trimmedContent) {
            console.log('[imagePromptGen] No <image> tags found, using <images> block content directly');
            return trimmedContent;
        }
    }

    // 3. 回退：匹配旧的 image### ... ### 格式
    const legacyRegex = /image###([\s\S]*?)###/;
    const legacyMatch = text.match(legacyRegex);

    if (legacyMatch && legacyMatch[1]) {
        console.log('[imagePromptGen] Using legacy image###...### format');
        return legacyMatch[1].trim();
    }

    return '';
}

/**
 * 读取文件为 base64
 * @param {File} file 
 * @returns {Promise<string>}
 */
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * 将图片附加到指定索引的消息中（OpenAI 多模态格式）
 * @param {Array} messages - 消息数组
 * @param {number} messageIndex - 要附加图片的消息索引
 * @param {Array} images - 图片数组 [{base64, name}]
 * @param {string} imageLabel - 图片标签前缀
 * @returns {Array} 处理后的消息数组
 */
function attachImagesToMessage(messages, messageIndex, images, imageLabel = '参考图片') {
    if (!images || images.length === 0 || messageIndex < 0 || messageIndex >= messages.length) {
        return messages;
    }

    const result = [...messages];
    const targetMsg = result[messageIndex];

    // 构建多模态 content 数组
    const contentParts = [];

    // 1. 原始文本内容
    if (typeof targetMsg.content === 'string') {
        contentParts.push({
            type: 'text',
            text: targetMsg.content
        });
    } else if (Array.isArray(targetMsg.content)) {
        contentParts.push(...targetMsg.content);
    }

    // 2. 添加图片标签说明
    if (images.length > 0) {
        contentParts.push({
            type: 'text',
            text: `\n[以下是用户上传的${images.length}张${imageLabel}]`
        });
    }

    // 3. 添加图片
    images.forEach((imgItem, idx) => {
        const imgBase64 = typeof imgItem === 'string' ? imgItem : imgItem.base64;
        const imgName = typeof imgItem === 'object' && imgItem.name ? imgItem.name : `${imageLabel}${idx + 1}`;

        contentParts.push({
            type: 'text',
            text: `[${imgName}]`
        });

        let imageUrl = imgBase64;
        if (!imgBase64.startsWith('data:')) {
            imageUrl = `data:image/png;base64,${imgBase64}`;
        }

        contentParts.push({
            type: 'image_url',
            image_url: {
                url: imageUrl,
                detail: 'auto'
            }
        });
    });

    result[messageIndex] = {
        ...targetMsg,
        content: contentParts
    };

    return result;
}

/**
 * 查找包含指定占位符的消息索引
 * @param {Array} messages - 消息数组
 * @param {string} placeholder - 要查找的占位符
 * @returns {number} 消息索引，未找到返回 -1
 */
function findMessageIndexWithPlaceholder(messages, placeholder) {
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (typeof msg.content === 'string' && msg.content.includes(placeholder)) {
            return i;
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'text' && part.text.includes(placeholder)) {
                    return i;
                }
            }
        }
    }
    return -1;
}

/**
 * 显示用户需求输入弹窗
 * @returns {Promise<{text: string, images: Array}|null>} 用户输入的需求和图片，取消时返回 null
 */
function showUserRequirementPopup() {
    return new Promise((resolve) => {
        // 存储上传的图片 base64 数据
        const uploadedImages = [];

        // 创建弹窗
        const parent = document.getElementById('st-chatu8-settings') || document.body;

        const backdrop = document.createElement('div');
        backdrop.className = 'st-chatu8-confirm-backdrop';

        const modal = document.createElement('div');
        modal.className = 'st-chatu8-confirm-box st-chatu8-popup-modal';

        // 标题
        const title = document.createElement('h3');
        title.className = 'st-chatu8-popup-title';
        title.textContent = '生成图片提示词';
        modal.appendChild(title);

        // 描述文字
        const description = document.createElement('p');
        description.className = 'st-chatu8-popup-description';
        description.textContent = '请输入您的具体需求，AI 将根据角色和服装信息生成图片提示词：';
        modal.appendChild(description);

        // 输入框
        const textarea = document.createElement('textarea');
        textarea.className = 'st-chatu8-textarea';
        textarea.rows = 4;
        textarea.placeholder = '例如：角色站在花园中、穿着校服的日常场景、光线柔和的室内...';
        modal.appendChild(textarea);

        // ==================== 图片上传区域 ====================
        const imageUploadSection = document.createElement('div');
        imageUploadSection.className = 'st-chatu8-popup-upload-section';

        // 图片上传标题行
        const uploadHeader = document.createElement('div');
        uploadHeader.className = 'st-chatu8-popup-upload-header';

        const uploadLabel = document.createElement('span');
        uploadLabel.className = 'st-chatu8-popup-upload-label';
        uploadLabel.textContent = '📎 参考图片（可选）';

        // 隐藏的文件输入
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.multiple = true;
        fileInput.style.display = 'none';

        // 上传按钮
        const uploadBtn = document.createElement('button');
        uploadBtn.type = 'button';
        uploadBtn.innerHTML = '<i class="fa-solid fa-plus"></i> 添加图片';
        uploadBtn.className = 'st-chatu8-btn st-chatu8-popup-upload-btn';
        uploadBtn.addEventListener('click', () => fileInput.click());

        uploadHeader.appendChild(uploadLabel);
        uploadHeader.appendChild(uploadBtn);

        // 图片预览容器
        const imagePreviewContainer = document.createElement('div');
        imagePreviewContainer.className = 'st-chatu8-popup-image-preview';

        // 空状态提示
        const emptyHint = document.createElement('div');
        emptyHint.className = 'st-chatu8-popup-empty-hint';
        emptyHint.textContent = '点击上方按钮添加参考图片';
        imagePreviewContainer.appendChild(emptyHint);

        /**
         * 更新图片预览
         */
        function updateImagePreviews() {
            imagePreviewContainer.innerHTML = '';

            if (uploadedImages.length === 0) {
                const hint = document.createElement('div');
                hint.className = 'st-chatu8-popup-empty-hint';
                hint.textContent = '点击上方按钮添加参考图片';
                imagePreviewContainer.appendChild(hint);
                return;
            }

            uploadedImages.forEach((imgObj, index) => {
                const itemContainer = document.createElement('div');
                itemContainer.className = 'st-chatu8-popup-image-item';

                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'st-chatu8-popup-image-wrapper';

                const img = document.createElement('img');
                img.src = imgObj.base64;

                // 删除按钮
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.className = 'st-chatu8-popup-image-delete';
                deleteBtn.innerHTML = '×';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    uploadedImages.splice(index, 1);
                    updateImagePreviews();
                });

                imgWrapper.addEventListener('mouseenter', () => {
                    deleteBtn.style.opacity = '1';
                });
                imgWrapper.addEventListener('mouseleave', () => {
                    deleteBtn.style.opacity = '0';
                });

                imgWrapper.appendChild(img);
                imgWrapper.appendChild(deleteBtn);

                // 名称输入框
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.className = 'st-chatu8-popup-image-name';
                nameInput.placeholder = `图${index + 1}`;
                nameInput.value = imgObj.name || '';
                nameInput.addEventListener('input', (e) => {
                    uploadedImages[index].name = e.target.value;
                });

                itemContainer.appendChild(imgWrapper);
                itemContainer.appendChild(nameInput);
                imagePreviewContainer.appendChild(itemContainer);
            });

            // 显示图片数量
            const countLabel = document.createElement('div');
            countLabel.className = 'st-chatu8-popup-image-count';
            countLabel.textContent = `已添加 ${uploadedImages.length} 张图片`;
            imagePreviewContainer.appendChild(countLabel);
        }

        // 处理文件选择
        fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;

                try {
                    const base64 = await readFileAsBase64(file);
                    uploadedImages.push({
                        base64: base64,
                        name: ''
                    });
                } catch (err) {
                    console.error('[imagePromptGen] Failed to read image:', err);
                }
            }

            updateImagePreviews();
            fileInput.value = '';
        });

        imageUploadSection.appendChild(uploadHeader);
        imageUploadSection.appendChild(fileInput);
        imageUploadSection.appendChild(imagePreviewContainer);
        modal.appendChild(imageUploadSection);

        // 按钮区域
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'st-chatu8-confirm-buttons';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.className = 'st-chatu8-btn';
        buttonContainer.appendChild(cancelButton);

        const confirmButton = document.createElement('button');
        confirmButton.innerHTML = '<i class="fa-solid fa-magic"></i> 生成';
        confirmButton.className = 'st-chatu8-btn st-chatu8-btn-primary';
        buttonContainer.appendChild(confirmButton);

        modal.appendChild(buttonContainer);
        backdrop.appendChild(modal);
        parent.appendChild(backdrop);

        // 聚焦到输入框
        setTimeout(() => textarea.focus(), 100);

        // 关闭弹窗函数
        const closeModal = (result) => {
            parent.removeChild(backdrop);
            resolve(result);
        };

        // 事件绑定 - 只允许通过按钮关闭
        cancelButton.addEventListener('click', () => closeModal(null));

        confirmButton.addEventListener('click', () => {
            const userRequirement = textarea.value.trim();
            closeModal({
                text: userRequirement || '',
                images: [...uploadedImages]
            });
        });

        // ESC 键取消
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                closeModal(null);
                document.removeEventListener('keydown', handleKeydown);
            } else if (e.key === 'Enter' && e.ctrlKey) {
                closeModal({
                    text: textarea.value.trim() || '',
                    images: [...uploadedImages]
                });
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);
    });
}

/**
 * 显示生成结果确认弹窗
 * @param {string} generatedPrompt - 生成的提示词
 * @returns {Promise<boolean>} 用户确认则返回 true
 */
function showResultConfirmPopup(generatedPrompt) {
    return new Promise((resolve) => {
        const parent = document.getElementById('st-chatu8-settings') || document.body;

        const backdrop = document.createElement('div');
        backdrop.className = 'st-chatu8-confirm-backdrop';

        const modal = document.createElement('div');
        modal.className = 'st-chatu8-confirm-box st-chatu8-popup-modal';

        // 标题
        const title = document.createElement('h3');
        title.className = 'st-chatu8-popup-title';
        title.textContent = '生成结果';
        modal.appendChild(title);

        // 描述文字
        const description = document.createElement('p');
        description.className = 'st-chatu8-popup-description';
        description.textContent = '以下是生成的图片提示词，确认后将保存到角色预设中：';
        modal.appendChild(description);

        // 显示生成的提示词
        const promptDisplay = document.createElement('textarea');
        promptDisplay.className = 'st-chatu8-textarea';
        promptDisplay.value = generatedPrompt;
        promptDisplay.rows = 8;
        modal.appendChild(promptDisplay);

        // 按钮区域
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'st-chatu8-confirm-buttons';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.className = 'st-chatu8-btn';
        buttonContainer.appendChild(cancelButton);

        const confirmButton = document.createElement('button');
        confirmButton.innerHTML = '<i class="fa-solid fa-check"></i> 确认保存';
        confirmButton.className = 'st-chatu8-btn st-chatu8-btn-success';
        buttonContainer.appendChild(confirmButton);

        modal.appendChild(buttonContainer);
        backdrop.appendChild(modal);
        parent.appendChild(backdrop);

        // 关闭弹窗函数
        const closeModal = (result, editedPrompt = null) => {
            parent.removeChild(backdrop);
            resolve({ confirmed: result, prompt: editedPrompt || generatedPrompt });
        };

        // 事件绑定 - 只允许通过按钮关闭
        cancelButton.addEventListener('click', () => closeModal(false));

        confirmButton.addEventListener('click', () => {
            // 使用用户可能编辑过的文本
            closeModal(true, promptDisplay.value.trim());
        });
    });
}

/**
 * 处理图片提示词生成请求
 * @param {string} userRequirement - 用户需求 (来自输入框)
 * @param {Array} userImages - 用户上传的图片数组 [{base64, name}]
 */
export async function handleImagePromptGenerate(userRequirement, userImages = []) {
    console.log('[imagePromptGen] Starting image prompt generation...');
    toastr.info('正在生成图片提示词...');

    try {
        const settings = extension_settings[extensionName];

        // 1. 获取当前角色预设
        const currentPreset = getCurrentCharacterPreset();
        if (!currentPreset) {
            toastr.error('请先选择一个角色预设');
            return;
        }

        console.log('[imagePromptGen] Current preset:', currentPreset.id);

        // 构建触发文本：用户需求 + 角色信息
        const currentCharacterText = buildCharacterText(currentPreset);
        const currentOutfitsText = buildOutfitsText(currentPreset);
        const triggerText = [userRequirement || '', currentCharacterText, currentOutfitsText].filter(Boolean).join('\n');

        // 2. 获取角色/服装展示提示词（使用触发文本来触发条目）
        let prompt = buildPromptForRequestType('char_display', triggerText);

        const replacedVariables = new Set();

        // ★ 使用新的 promptProcessor 模块进行处理
        // 1. 先合并相邻相同角色的消息
        prompt = mergeAdjacentMessages(prompt);
        console.log('[imagePromptGen] 合并相邻消息后:', prompt);

        // 4. 替换占位符 - 只提供角色和服装信息
        // 注意：不提供上下文、世界书、变量

        // 在替换前先找到包含 {{用户需求}} 的消息索引（用于后续附加图片）
        const userRequirementMessageIndex = findMessageIndexWithPlaceholder(prompt, '{{用户需求}}');
        console.log('[imagePromptGen] User requirement message index:', userRequirementMessageIndex);

        prompt = replaceOnePlaceholder(prompt, "{{当前角色}}", currentCharacterText, replacedVariables);
        prompt = replaceOnePlaceholder(prompt, "{{服装列表}}", currentOutfitsText, replacedVariables);
        prompt = replaceOnePlaceholder(prompt, "{{用户需求}}", userRequirement || '', replacedVariables);

        // 清空不需要的占位符
        prompt = replaceOnePlaceholder(prompt, "{{当前服装}}", "", replacedVariables);
        prompt = replaceOnePlaceholder(prompt, "{{上下文}}", '', replacedVariables);
        prompt = replaceOnePlaceholder(prompt, "{{世界书触发}}", '', replacedVariables);
        prompt = replaceOnePlaceholder(prompt, "{{角色启用列表}}", '', replacedVariables);
        prompt = replaceOnePlaceholder(prompt, "{{通用服装启用列表}}", '', replacedVariables);
        prompt = replaceOnePlaceholder(prompt, "{{通用角色启用列表}}", '', replacedVariables);

        console.log('[imagePromptGen] Final prompt:', prompt);

        // 更新调试显示
        let diagnosticText = "";
        if (replacedVariables.size > 0) {
            diagnosticText = `诊断：检测到以下变量被使用：${[...replacedVariables].join('、')}\n`;
        }

        // 如果有用户上传的图片，附加到包含用户需求的消息
        if (userImages && userImages.length > 0 && userRequirementMessageIndex >= 0) {
            prompt = attachImagesToMessage(prompt, userRequirementMessageIndex, userImages, '参考图片');
            console.log('[imagePromptGen] Attached', userImages.length, 'images to message at index', userRequirementMessageIndex);
        }

        updateCombinedPrompt(prompt, diagnosticText);

        // 5. 执行 LLM 请求
        const llmOutput = await LLM_CHAR_DISPLAY(prompt, { timeoutMs: 300000 });
        console.log('[imagePromptGen] LLM output:', llmOutput);

        if (!llmOutput) {
            toastr.error('LLM 返回结果为空');
            return;
        }

        // 6. 使用正则提取 image### ... ### 格式的提示词
        const extractedPrompt = extractImagePrompt(llmOutput);

        if (!extractedPrompt) {
            toastr.warning('未在 LLM 输出中检测到 image###...### 格式的提示词');
            console.log('[imagePromptGen] Raw LLM output for debugging:', llmOutput);
            return;
        }

        console.log('[imagePromptGen] Extracted prompt:', extractedPrompt);

        // 7. 显示确认弹窗
        const result = await showResultConfirmPopup(extractedPrompt);

        if (!result.confirmed) {
            toastr.info('已取消保存');
            return;
        }

        // 8. 保存到角色预设的 photoPrompt 字段
        const preset = settings.characterPresets[currentPreset.id];
        if (preset) {
            preset.photoPrompt = result.prompt;
            saveSettingsDebounced();

            // 更新页面上的提示词输入框
            const photoPromptElement = document.getElementById('char_photo_prompt');
            if (photoPromptElement) {
                photoPromptElement.value = result.prompt;
            }

            toastr.success('图片提示词已生成并保存！');
        }

    } catch (error) {
        console.error('[imagePromptGen] Error:', error);
        toastr.error(`图片提示词生成失败: ${error.message}`);
    }
}

/**
 * 处理按钮点击事件
 * 显示用户需求输入弹窗，然后调用生成函数
 */
export async function handlePhotoGeneratePromptClick() {
    // 显示用户需求输入弹窗
    const popupResult = await showUserRequirementPopup();

    if (popupResult === null) {
        // 用户取消
        return;
    }

    // 调用生成函数，传递文本和图片
    await handleImagePromptGenerate(popupResult.text, popupResult.images);
}
