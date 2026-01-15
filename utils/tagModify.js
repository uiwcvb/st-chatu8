// @ts-nocheck
/**
 * Tag 修改模块
 * 通过 LLM 辅助修改图片标签
 */

import { getElContext, processWorldBooksWithTrigger, LLM_TAG_MODIFY } from './promptReq.js';
import { generateCharacterListText, generateCommonCharacterListText, generateOutfitEnableListText } from './settings/worldbook.js';
import { getContext } from '../../../../st-context.js';
import { updateCombinedPrompt } from './settings/llm.js';
import { buildPromptForRequestType } from './settings/llmService.js';

import { isMobileDevice, removeThinkingTags } from './utils.js';
import { mergeAdjacentMessages, replaceAllPlaceholders, replacePlaceholder as replaceOnePlaceholder } from './promptProcessor.js';

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
 * 显示修改 tag 需求输入弹窗
 * @returns {Promise<{text: string, images: Array<{base64: string, name: string}>}|null>} 用户输入的需求和图片，取消时返回 null
 */
function showTagModifyDemandPopup() {
    return new Promise((resolve) => {
        const isMobile = isMobileDevice();

        // 存储上传的图片 base64 数据
        const uploadedImages = [];

        // 移动端：获取 top-settings-holder 和 send_form 的位置
        let topBound = 10;
        let bottomBound = window.innerHeight - 10;

        if (isMobile) {
            const topSettingsHolder = document.querySelector('#top-settings-holder');
            if (topSettingsHolder) {
                const rect = topSettingsHolder.getBoundingClientRect();
                topBound = rect.bottom + 10;
            }
            const sendForm = document.querySelector('#send_form');
            if (sendForm) {
                const rect = sendForm.getBoundingClientRect();
                bottomBound = rect.top - 10;
            }
        }

        // 计算可用高度
        const availableHeight = bottomBound - topBound;
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.id = 'tag-modify-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            z-index: 10001;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.2s ease-out;
        `;

        // 创建气泡容器
        const bubble = document.createElement('div');

        // 根据设备类型应用不同的样式
        if (isMobile) {
            // 移动端：固定定位在 top-settings-holder 下方
            bubble.style.cssText = `
                position: fixed;
                top: ${topBound}px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 24px;
                min-width: 300px;
                max-width: 90vw;
                max-height: ${availableHeight}px;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 
                            0 0 40px rgba(100, 100, 255, 0.1),
                            inset 0 1px 0 rgba(255, 255, 255, 0.1);
                animation: scaleInMobile 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                transform-origin: top center;
                z-index: 10002;
            `;
        } else {
            // 电脑端：居中显示
            bubble.style.cssText = `
                background: linear-gradient(135deg, #1e1e2e 0%, #2d2d44 100%);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 24px;
                min-width: 400px;
                max-width: 600px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), 
                            0 0 40px rgba(100, 100, 255, 0.1),
                            inset 0 1px 0 rgba(255, 255, 255, 0.1);
                animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                transform-origin: center;
            `;
        }

        // 标题
        const title = document.createElement('div');
        title.textContent = '🏷️ 修改 Tag';
        title.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            color: #e0e0ff;
            margin-bottom: 16px;
            text-align: center;
        `;

        // 提示文字
        const hint = document.createElement('div');
        hint.textContent = '请描述您希望如何修改当前的图片标签';
        hint.style.cssText = `
            font-size: 13px;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 12px;
            text-align: center;
        `;

        // 输入框
        const textarea = document.createElement('textarea');
        textarea.placeholder = '例如：把背景改成夜晚、给人物添加翅膀、增加更多细节...';
        textarea.style.cssText = `
            width: 100%;
            min-height: 120px;
            padding: 14px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 10px;
            background: rgba(0, 0, 0, 0.3);
            color: #fff;
            font-size: 14px;
            line-height: 1.6;
            resize: vertical;
            outline: none;
            transition: border-color 0.2s, box-shadow 0.2s;
            box-sizing: border-box;
        `;
        textarea.addEventListener('focus', () => {
            textarea.style.borderColor = 'rgba(100, 150, 255, 0.5)';
            textarea.style.boxShadow = '0 0 15px rgba(100, 150, 255, 0.15)';
        });
        textarea.addEventListener('blur', () => {
            textarea.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            textarea.style.boxShadow = 'none';
        });

        // ==================== 图片上传区域 ====================
        const imageUploadSection = document.createElement('div');
        imageUploadSection.style.cssText = `
            margin-top: 16px;
            padding: 12px;
            border: 1px dashed rgba(255, 255, 255, 0.2);
            border-radius: 10px;
            background: rgba(0, 0, 0, 0.2);
        `;

        // 图片上传标题行
        const uploadHeader = document.createElement('div');
        uploadHeader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        `;

        const uploadLabel = document.createElement('span');
        uploadLabel.textContent = '📎 参考图片（可选）';
        uploadLabel.style.cssText = `
            font-size: 13px;
            color: rgba(255, 255, 255, 0.7);
        `;

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
        uploadBtn.style.cssText = `
            padding: 6px 12px;
            border: 1px solid rgba(100, 150, 255, 0.4);
            border-radius: 6px;
            background: rgba(100, 150, 255, 0.1);
            color: rgba(100, 150, 255, 0.9);
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 4px;
        `;
        uploadBtn.addEventListener('mouseenter', () => {
            uploadBtn.style.background = 'rgba(100, 150, 255, 0.2)';
            uploadBtn.style.borderColor = 'rgba(100, 150, 255, 0.6)';
        });
        uploadBtn.addEventListener('mouseleave', () => {
            uploadBtn.style.background = 'rgba(100, 150, 255, 0.1)';
            uploadBtn.style.borderColor = 'rgba(100, 150, 255, 0.4)';
        });
        uploadBtn.addEventListener('click', () => fileInput.click());

        uploadHeader.appendChild(uploadLabel);
        uploadHeader.appendChild(uploadBtn);

        // 图片预览容器
        const imagePreviewContainer = document.createElement('div');
        imagePreviewContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            min-height: 0;
        `;

        // 空状态提示
        const emptyHint = document.createElement('div');
        emptyHint.textContent = '点击上方按钮添加参考图片';
        emptyHint.style.cssText = `
            font-size: 12px;
            color: rgba(255, 255, 255, 0.4);
            text-align: center;
            width: 100%;
            padding: 8px 0;
        `;
        imagePreviewContainer.appendChild(emptyHint);

        /**
         * 更新图片预览
         */
        function updateImagePreviews() {
            imagePreviewContainer.innerHTML = '';

            if (uploadedImages.length === 0) {
                const hint = document.createElement('div');
                hint.textContent = '点击上方按钮添加参考图片';
                hint.style.cssText = `
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.4);
                    text-align: center;
                    width: 100%;
                    padding: 8px 0;
                `;
                imagePreviewContainer.appendChild(hint);
                return;
            }

            uploadedImages.forEach((imgObj, index) => {
                // 图片项容器（包含图片和名称输入）
                const itemContainer = document.createElement('div');
                itemContainer.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                `;

                const imgWrapper = document.createElement('div');
                imgWrapper.style.cssText = `
                    position: relative;
                    width: 60px;
                    height: 60px;
                    border-radius: 6px;
                    overflow: hidden;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                `;

                const img = document.createElement('img');
                img.src = imgObj.base64;
                img.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                `;

                // 删除按钮
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.innerHTML = '×';
                deleteBtn.style.cssText = `
                    position: absolute;
                    top: 2px;
                    right: 2px;
                    width: 18px;
                    height: 18px;
                    border: none;
                    border-radius: 50%;
                    background: rgba(255, 80, 80, 0.9);
                    color: #fff;
                    font-size: 14px;
                    line-height: 1;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    opacity: 0;
                    transition: opacity 0.2s;
                `;
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
                nameInput.placeholder = `图${index + 1}`;
                nameInput.value = imgObj.name || '';
                nameInput.style.cssText = `
                    width: 60px;
                    padding: 2px 4px;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                    background: rgba(0, 0, 0, 0.3);
                    color: #fff;
                    font-size: 10px;
                    text-align: center;
                    outline: none;
                `;
                nameInput.addEventListener('input', (e) => {
                    uploadedImages[index].name = e.target.value;
                });
                nameInput.addEventListener('focus', () => {
                    nameInput.style.borderColor = 'rgba(100, 150, 255, 0.5)';
                });
                nameInput.addEventListener('blur', () => {
                    nameInput.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                });

                itemContainer.appendChild(imgWrapper);
                itemContainer.appendChild(nameInput);
                imagePreviewContainer.appendChild(itemContainer);
            });

            // 显示图片数量
            const countLabel = document.createElement('div');
            countLabel.textContent = `已添加 ${uploadedImages.length} 张图片`;
            countLabel.style.cssText = `
                font-size: 11px;
                color: rgba(100, 150, 255, 0.8);
                width: 100%;
                text-align: right;
                margin-top: 4px;
            `;
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
                    // 存储为对象，包含 base64 和可选名称
                    uploadedImages.push({
                        base64: base64,
                        name: '' // 用户可选填
                    });
                } catch (err) {
                    console.error('[showTagModifyDemandPopup] Failed to read image:', err);
                }
            }

            updateImagePreviews();
            // 重置文件输入，允许重复选择同一文件
            fileInput.value = '';
        });

        imageUploadSection.appendChild(uploadHeader);
        imageUploadSection.appendChild(fileInput);
        imageUploadSection.appendChild(imagePreviewContainer);

        // ==================== 按钮容器 ====================
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 12px;
            margin-top: 20px;
            justify-content: center;
        `;

        // 取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 10px 28px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            background: transparent;
            color: rgba(255, 255, 255, 0.7);
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
        `;
        cancelBtn.addEventListener('mouseenter', () => {
            cancelBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.3)';
        });
        cancelBtn.addEventListener('mouseleave', () => {
            cancelBtn.style.background = 'transparent';
            cancelBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        });

        // 确定按钮
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确定修改';
        confirmBtn.style.cssText = `
            padding: 10px 28px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: #fff;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
        `;
        confirmBtn.addEventListener('mouseenter', () => {
            confirmBtn.style.transform = 'translateY(-2px)';
            confirmBtn.style.boxShadow = '0 6px 20px rgba(99, 102, 241, 0.4)';
        });
        confirmBtn.addEventListener('mouseleave', () => {
            confirmBtn.style.transform = 'translateY(0)';
            confirmBtn.style.boxShadow = '0 4px 15px rgba(99, 102, 241, 0.3)';
        });

        // 添加动画样式
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes scaleIn {
                from { transform: scale(0.9); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            @keyframes scaleInMobile {
                from { transform: translateX(-50%) scale(0.9); opacity: 0; }
                to { transform: translateX(-50%) scale(1); opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);

        // 关闭弹窗函数
        const closePopup = (result) => {
            overlay.style.animation = 'fadeOut 0.15s ease-out forwards';
            setTimeout(() => {
                overlay.remove();
                style.remove();
                resolve(result);
            }, 150);
        };

        // 绑定事件
        cancelBtn.addEventListener('click', () => closePopup(null));
        confirmBtn.addEventListener('click', () => closePopup({
            text: textarea.value.trim() || '',
            images: [...uploadedImages]
        }));

        // ESC 键关闭
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                closePopup(null);
                document.removeEventListener('keydown', handleKeydown);
            } else if (e.key === 'Enter' && e.ctrlKey) {
                closePopup({
                    text: textarea.value.trim() || '',
                    images: [...uploadedImages]
                });
                document.removeEventListener('keydown', handleKeydown);
            }
        };
        document.addEventListener('keydown', handleKeydown);

        // 不允许点击遮罩关闭，只能通过按钮关闭

        // 组装元素
        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(confirmBtn);
        bubble.appendChild(title);
        bubble.appendChild(hint);
        bubble.appendChild(textarea);
        bubble.appendChild(imageUploadSection);
        bubble.appendChild(buttonContainer);
        overlay.appendChild(bubble);
        document.body.appendChild(overlay);

        // 自动聚焦输入框
        setTimeout(() => textarea.focus(), 100);
    });
}

/**
 * 从 LLM 响应中解析 image###...### 格式的 tag
 * @param {string} text - LLM 响应文本
 * @returns {string|null} 解析出的 tag，未找到返回 null
 */
function parseImageTagFromResponse(text) {
    if (!text || typeof text !== 'string') return null;

    // 预处理：统一换行符
    let normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    console.log('[parseImageTagFromResponse] Input text length:', normalizedText.length);

    // 1. 首先尝试提取 <image>...</image> 标签内的内容
    const imageTagRegex = /<image>([\s\S]*?)<\/image>/i;
    const imageTagMatch = normalizedText.match(imageTagRegex);
    if (imageTagMatch && imageTagMatch[1]) {
        normalizedText = imageTagMatch[1];
        console.log('[parseImageTagFromResponse] Extracted content from <image> tag');
    }

    // 2. 在提取的内容中匹配 image###...###
    // 更宽松的正则：
    // - image 和 ### 之间可能有空格
    // - 使用 [\s\S] 匹配任意字符包括换行
    // - 支持 ### 前后可能有空格
    const regex = /image\s*###\s*([\s\S]*?)\s*###/i;
    const match = normalizedText.match(regex);

    if (match && match[1]) {
        const result = match[1].trim();
        console.log('[parseImageTagFromResponse] Matched tag:', result.substring(0, 100) + (result.length > 100 ? '...' : ''));
        return result;
    }

    // 3. 如果标准格式没匹配到，尝试更宽松的备选方案（2个或更多#）
    const fallbackRegex = /image\s*#{2,}\s*([\s\S]*?)\s*#{2,}/i;
    const fallbackMatch = normalizedText.match(fallbackRegex);
    if (fallbackMatch && fallbackMatch[1]) {
        const result = fallbackMatch[1].trim();
        console.log('[parseImageTagFromResponse] Matched with fallback regex:', result.substring(0, 100) + (result.length > 100 ? '...' : ''));
        return result;
    }

    console.warn('[parseImageTagFromResponse] No match found in text:', normalizedText.substring(0, 300));
    return null;
}

/**
 * 替换占位符函数
 * @param {*} obj - 要处理的对象（可以是字符串、数组或对象）
 * @param {string} placeholder - 占位符
 * @param {*} value - 替换的值
 * @returns {*} 替换后的对象
 */
function replacePlaceholder(obj, placeholder, value) {
    if (typeof obj === 'string') {
        return obj.replaceAll(placeholder, value || '');
    }
    if (Array.isArray(obj)) {
        return obj.map(item => replacePlaceholder(item, placeholder, value));
    }
    if (obj && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
            newObj[key] = replacePlaceholder(obj[key], placeholder, value);
        }
        return newObj;
    }
    return obj;
}

/**
 * 将图片附加到指定索引的消息中（OpenAI 多模态格式）
 * @param {Array} messages - 消息数组
 * @param {number} messageIndex - 要附加图片的消息索引
 * @param {Array<{base64: string, name: string}>} images - 图片数组
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
        // 已经是多模态格式，直接使用
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

        // 添加图片名称标签
        contentParts.push({
            type: 'text',
            text: `[${imgName}]`
        });

        // 解析 base64 格式
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

    // 更新消息内容
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
 * 处理修改 tag 请求
 * @param {HTMLElement} el - 触发元素（用于获取上下文）
 * @param {string} currentTag - 当前的 tag 内容
 * @param {HTMLTextAreaElement} inputEl - tag 编辑框的输入框元素
 */
export async function handleTagModifyRequest(el, currentTag, inputEl) {
    console.log('[tagModify] Starting tag modification request');
    console.log('[tagModify] Current tag:', currentTag);

    // 1. 显示需求输入弹窗
    const popupResult = await showTagModifyDemandPopup();
    if (popupResult === null) {
        console.log('[tagModify] User cancelled');
        toastr.info('已取消修改');
        return;
    }

    // popupResult 现在是 {text, images} 对象
    const userDemand = popupResult.text || '';
    const userUploadedImages = popupResult.images || [];

    if (!userDemand) {
        toastr.warning('请输入修改需求');
        return;
    }

    console.log('[tagModify] User demand:', userDemand);
    console.log('[tagModify] User uploaded images count:', userUploadedImages.length);

    toastr.info('正在处理修改请求...');

    try {
        // 2. 获取上下文
        let contextElements = [];
        let nowtxt = '';

        if (el) {
            contextElements = await getElContext(el) || [];
            nowtxt = contextElements[contextElements.length - 1] || '';
        }

        console.log('[tagModify] Context elements:', contextElements);

        // 3. 获取世界书触发内容
        const triggerElements = userDemand
            ? [...contextElements, userDemand, currentTag]
            : [...contextElements, currentTag];
        const triggeredContent = await processWorldBooksWithTrigger(triggerElements);

        console.log('[tagModify] Triggered world book content:', triggeredContent);

        // 5. 获取角色/服装列表信息（基于触发文本过滤）
        const context = getContext();

        // ★ 构建条目触发文本：只使用用户需求 + 正文 + 当前tag
        const entryTriggerTextParts = [];
        if (userDemand) {
            entryTriggerTextParts.push(userDemand);
        }
        if (nowtxt) {
            entryTriggerTextParts.push(nowtxt);
        }
        if (currentTag) {
            entryTriggerTextParts.push(currentTag);
        }
        const entryTriggerText = entryTriggerTextParts.join('\n');

        // ★ 构建角色触发文本：用户需求 + 上下文 + 世界书触发 + 当前tag（用于角色列表生成）
        const characterTriggerTextParts = [];
        if (userDemand) {
            characterTriggerTextParts.push(userDemand);
        }
        if (contextElements && contextElements.length > 0) {
            characterTriggerTextParts.push(contextElements.join('\n'));
        }
        if (triggeredContent) {
            characterTriggerTextParts.push(triggeredContent);
        }
        if (currentTag) {
            characterTriggerTextParts.push(currentTag);
        }
        const characterTriggerText = characterTriggerTextParts.join('\n');
        console.log('[tagModify] Character trigger text:', characterTriggerText);

        // 4. 获取 LLM 提示词模板（使用条目触发文本来触发条目）
        let prompt = buildPromptForRequestType('tag_modify', entryTriggerText);

        console.log('[tagModify] Got prompt template:', prompt);

        const characterListText = generateCharacterListText(characterTriggerText);
        const outfitEnableListText = generateOutfitEnableListText();
        const commonCharacterListText = generateCommonCharacterListText();
        console.log('[tagModify] Character list text (triggered):', characterListText);
        const variables = context.chatMetadata?.variables || {};

        // ★ 使用新的 promptProcessor 模块进行处理
        // 1. 先合并相邻相同角色的消息
        prompt = mergeAdjacentMessages(prompt);
        console.log('[tagModify] 合并相邻消息后:', prompt);

        // 记录包含 {{用户需求}} 的消息位置，以便后续附加图片
        const userDemandMsgIndex = findMessageIndexWithPlaceholder(prompt, '{{用户需求}}');

        // 2. 准备上下文数据用于占位符替换
        const contextData = {
            context: contextElements.join('\n'),
            body: nowtxt,
            worldBookContent: triggeredContent,
            variables: variables,
            userDemand: userDemand,
            characterListText: characterListText,
            outfitEnableListText: outfitEnableListText,
            commonCharacterListText: commonCharacterListText
        };

        // 3. 替换所有标准占位符
        const { messages: processedMessages } = replaceAllPlaceholders(prompt, contextData);
        prompt = processedMessages;

        // 4. 替换特殊占位符（当前tag）
        prompt = replaceOnePlaceholder(prompt, '{{当前tag}}', currentTag);

        // 7. 如果有上传的图片，附加到包含用户需求的消息中
        if (userUploadedImages.length > 0 && userDemandMsgIndex !== -1) {
            prompt = attachImagesToMessage(prompt, userDemandMsgIndex, userUploadedImages, '参考图片');
            console.log('[tagModify] Attached', userUploadedImages.length, 'images to message at index', userDemandMsgIndex);
        }

        console.log('[tagModify] Sending LLM request with prompt:', prompt);

        // 8. 更新调试显示
        const diagnosticText = `[Tag修改] 用户需求: ${userDemand}${userUploadedImages.length > 0 ? `\n已附加 ${userUploadedImages.length} 张参考图片` : ''}`;
        updateCombinedPrompt(prompt, diagnosticText);

        // 9. 调用 LLM
        const response = await LLM_TAG_MODIFY(prompt, { timeoutMs: 300000 });
        console.log('[tagModify] LLM response:', response);

        // 提取实际的响应文本（LLM_TAG_MODIFY 返回 { result, testMode } 对象）
        const responseText = response?.result || response;
        console.log('[tagModify] Response text:', typeof responseText, responseText?.substring?.(0, 200));

        // 10. 解析结果（先移除 thinking 标签）
        const cleanedResponseText = removeThinkingTags(responseText);
        const newTag = parseImageTagFromResponse(cleanedResponseText);
        if (newTag) {
            inputEl.value = newTag;
            toastr.success('Tag 修改成功！');
            console.log('[tagModify] New tag:', newTag);
        } else {
            toastr.warning('未能从响应中解析出有效的 tag');
            console.warn('[tagModify] Could not parse tag from response:', response);
        }

    } catch (error) {
        console.error('[tagModify] Error:', error);
        toastr.error(`修改失败: ${error.message}`);
    }
}
