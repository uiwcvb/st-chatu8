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

    const resetButton = doc.createElement('button');
    resetButton.className = 'st-chatu8-edit-button send';
    resetButton.textContent = '重置tag';
    resetButton.onclick = () => {
        input.value = button.dataset.link;
    };

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
    sendButton.onclick = () => {
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
    buttonContainer.appendChild(resetButton);
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
