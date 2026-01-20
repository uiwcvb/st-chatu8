// @ts-nocheck
/**
 * promptReq.js - 手势请求处理模块（核心协调器）
 * 
 * 处理手势识别后的请求，协调各个子模块
 * 
 * 注意：为保持向后兼容，所有拆分出去的函数都在此文件中重新导出
 */

import { getContext } from "../../../../st-context.js";
import { extensionName } from "../utils/config.js";
import { extension_settings } from "../../../../extensions.js";
import { updateCombinedPrompt } from "./settings/llm.js";
import { generateCharacterListText, generateCommonCharacterListText, generateOutfitEnableListText, getEnabledCharacterImages, getEnabledOutfitImages, getCommonCharacterImages } from "./settings/worldbook.js";
import { isMobileDevice, removeThinkingTags } from "./utils.js";

// ==================== 从子模块重新导出（保持向后兼容） ====================

// LLM 请求函数
export {
    generateRequestId,
    LLM_GET_PROMPT,
    LLM_IMAGE_GEN_GET_PROMPT,
    LLM_CHAR_DESIGN_GET_PROMPT,
    LLM_CHAR_DISPLAY_GET_PROMPT,
    LLM_CHAR_MODIFY_GET_PROMPT,
    LLM_TAG_MODIFY_GET_PROMPT,
    LLM_EXECUTE,
    LLM_IMAGE_GEN,
    LLM_CHAR_DESIGN,
    LLM_CHAR_DISPLAY,
    LLM_CHAR_MODIFY,
    LLM_TAG_MODIFY,
} from './llmRequest.js';

// 世界书处理函数
export { processWorldBooksWithTrigger } from './worldbookProcessor.js';

// 数据工具函数
export {
    setcharData,
    getcharData,
    getElContext,
    getrWorlds,
    getcharWorld,
    getglobalSelectWorld,
    getWorldEntries,
} from './chatDataUtils.js';

// 图片插入函数
export {
    parseImagesFromPrompt,
    insertImagesIntoElement,
    fuzzyMatchLine,
    calculateLineSimilarity,
    calculateNgramSimilarity,
    generateElKey,
    saveImageGroup,
    generateStableId,
    findTagInImageGroups,
} from './imageInserter.js';

// ==================== 导入用于本模块的函数 ====================

import { LLM_IMAGE_GEN_GET_PROMPT, LLM_IMAGE_GEN } from './llmRequest.js';
import { processWorldBooksWithTrigger } from './worldbookProcessor.js';
import { getElContext } from './chatDataUtils.js';
import { parseImagesFromPrompt, insertImagesIntoElement } from './imageInserter.js';
import { getProcessedPrompt, replaceAllPlaceholders, mergeAdjacentMessages } from './promptProcessor.js';
import { buildPromptForRequestType } from './settings/llmService.js';

// ==================== 本模块专有函数 ====================

/**
 * 显示用户需求输入弹窗（用于生图请求）
 * @returns {Promise<{text: string, images: string[]}|null>} 用户输入的需求和图片base64数组，取消时返回 null
 */
function showUserDemandPopup() {
    return new Promise((resolve) => {
        const isMobile = isMobileDevice();

        // 存储上传的图片 base64 数据
        const uploadedImages = [];

        // 移动端：获取 top-settings-holder 的下边框位置
        let topOffset = 10;
        let maxHeight = 'none';
        if (isMobile) {
            const topSettingsHolder = document.querySelector('#top-settings-holder');
            if (topSettingsHolder) {
                const rect = topSettingsHolder.getBoundingClientRect();
                // 确保 topOffset 在有效范围内（最小10px，最大不超过视口高度的一半）
                topOffset = Math.max(10, Math.min(rect.bottom + 10, window.innerHeight * 0.5));
            }
            // 计算可用高度，确保至少有 200px 的高度
            const availableHeight = Math.max(200, window.innerHeight - topOffset - 20);
            maxHeight = `${availableHeight}px`;
        }

        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.id = 'user-demand-overlay';
        overlay.className = 'st-chatu8-popup-overlay';

        // 创建气泡容器
        const bubble = document.createElement('div');
        bubble.className = 'st-chatu8-popup-bubble';
        if (isMobile) {
            bubble.classList.add('mobile');
            bubble.style.top = `${topOffset}px`;
            bubble.style.maxHeight = maxHeight;
        }

        // 标题
        const title = document.createElement('div');
        title.textContent = '🖼️ 输入生图需求';
        title.className = 'st-chatu8-popup-title';

        // 提示文字
        const hint = document.createElement('div');
        hint.textContent = '请描述您希望生成的图片的具体需求（可选）';
        hint.className = 'st-chatu8-popup-hint';

        // 输入框
        const textarea = document.createElement('textarea');
        textarea.placeholder = '例如：重点描绘场景氛围，光线柔和...';
        textarea.className = 'st-chatu8-popup-textarea';

        // ==================== 图片上传区域 ====================
        const imageUploadSection = document.createElement('div');
        imageUploadSection.className = 'st-chatu8-popup-upload-section';

        // 图片上传标题行
        const uploadHeader = document.createElement('div');
        uploadHeader.className = 'st-chatu8-popup-upload-header';

        const uploadLabel = document.createElement('span');
        uploadLabel.textContent = '📎 参考图片（可选）';
        uploadLabel.className = 'st-chatu8-popup-upload-label';

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
        uploadBtn.className = 'st-chatu8-popup-upload-btn';
        uploadBtn.addEventListener('click', () => fileInput.click());

        uploadHeader.appendChild(uploadLabel);
        uploadHeader.appendChild(uploadBtn);

        // 图片预览容器
        const imagePreviewContainer = document.createElement('div');
        imagePreviewContainer.className = 'st-chatu8-popup-preview-container';

        // 空状态提示
        const emptyHint = document.createElement('div');
        emptyHint.textContent = '点击上方按钮添加参考图片';
        emptyHint.className = 'st-chatu8-popup-empty-hint';
        imagePreviewContainer.appendChild(emptyHint);

        /**
         * 更新图片预览
         */
        function updateImagePreviews() {
            imagePreviewContainer.innerHTML = '';

            if (uploadedImages.length === 0) {
                const hint = document.createElement('div');
                hint.textContent = '点击上方按钮添加参考图片';
                hint.className = 'st-chatu8-popup-empty-hint';
                imagePreviewContainer.appendChild(hint);
                return;
            }

            uploadedImages.forEach((imgObj, index) => {
                // 图片项容器（包含图片和名称输入）
                const itemContainer = document.createElement('div');
                itemContainer.className = 'st-chatu8-popup-img-item';

                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'st-chatu8-popup-img-wrapper';

                const img = document.createElement('img');
                img.src = imgObj.base64;

                // 删除按钮
                const deleteBtn = document.createElement('button');
                deleteBtn.type = 'button';
                deleteBtn.innerHTML = '×';
                deleteBtn.className = 'st-chatu8-popup-img-delete';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    uploadedImages.splice(index, 1);
                    updateImagePreviews();
                });

                imgWrapper.appendChild(img);
                imgWrapper.appendChild(deleteBtn);

                // 名称输入框
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.placeholder = `图${index + 1}`;
                nameInput.value = imgObj.name || '';
                nameInput.className = 'st-chatu8-popup-img-name';
                nameInput.addEventListener('input', (e) => {
                    uploadedImages[index].name = e.target.value;
                });

                itemContainer.appendChild(imgWrapper);
                itemContainer.appendChild(nameInput);
                imagePreviewContainer.appendChild(itemContainer);
            });

            // 显示图片数量
            const countLabel = document.createElement('div');
            countLabel.textContent = `已添加 ${uploadedImages.length} 张图片`;
            countLabel.className = 'st-chatu8-popup-img-count';
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
                    console.error('[showUserDemandPopup] Failed to read image:', err);
                }
            }

            updateImagePreviews();
            // 重置文件输入，允许重复选择同一文件
            fileInput.value = '';
        });

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

        imageUploadSection.appendChild(uploadHeader);
        imageUploadSection.appendChild(fileInput);
        imageUploadSection.appendChild(imagePreviewContainer);

        // ==================== 按钮容器 ====================
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'st-chatu8-popup-buttons';

        // 取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.className = 'st-chatu8-popup-btn-cancel';

        // 确定按钮
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确定生成';
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

        // 不再点击遮罩关闭，只能通过按钮关闭

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
 * 处理手势识别后的请求
 * @param {HTMLElement} el - 触发手势的 DOM 元素
 * @param {string} gestureId - 识别出的手势 ID
 */
export async function handlePromptRequest(el, gestureId) {


    // 检查是否启用用户需求弹窗
    const imageGenDemandEnabled = extension_settings[extensionName]?.imageGenDemandEnabled ?? false;
    let userDemand = '';
    let userUploadedImages = []; // 用户上传的参考图片（base64）

    if (imageGenDemandEnabled) {
        const result = await showUserDemandPopup();
        if (result === null) {
            toastr.info('已取消生图请求');
            return;
        }
        // result 现在是 {text, images} 对象
        userDemand = result.text || extension_settings[extensionName]?.defaultImageDemand || '';
        userUploadedImages = result.images || [];

    } else {
        // 未启用弹窗时也使用默认值
        userDemand = extension_settings[extensionName]?.defaultImageDemand || '';
    }

    toastr.info('正在处理正文生图请求...');

    let context = getContext();



    // 获取配置的历史层数，+1 是因为 llm_history_depth 不含正文层
    const historyDepth = (extension_settings[extensionName]?.llm_history_depth ?? 2) + 1;
    const contextElements = await getElContext(el, historyDepth);



    const nowtxt = contextElements[contextElements.length - 1];



    let triggeredContent = "";

    if (contextElements) {


        // 使用 contextElements 作为触发文本处理世界书
        // 将用户需求也加入触发文本
        const triggerElements = userDemand
            ? [...contextElements, userDemand]
            : contextElements;
        triggeredContent = await processWorldBooksWithTrigger(triggerElements);

        if (triggeredContent) {

            // 这里可以继续处理触发的内容
        }
    }

    let variables = context.chatMetadata.variables || {};

    // 构建 {{上下文}}（不含正文）- 用于替换 {{上下文}} 占位符
    const contextWithoutBody = contextElements && contextElements.length > 1
        ? contextElements.slice(0, -1)
        : [];

    // ★ 构建条目触发文本：只使用用户需求 + 正文
    const entryTriggerTextParts = [];
    if (userDemand) {
        entryTriggerTextParts.push(userDemand);
    }
    if (nowtxt) {
        entryTriggerTextParts.push(nowtxt);
    }
    const entryTriggerText = entryTriggerTextParts.join('\n');

    // ★ 构建角色触发文本：用户需求 + 完整上下文（含正文） + 世界书触发
    // 用于角色列表生成，需要更广泛的匹配范围
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
    const characterTriggerText = characterTriggerTextParts.join('\n');

    // ★ 使用条目触发文本来构建 prompt（只用用户需求+正文触发条目）
    let promt = buildPromptForRequestType('image_gen', entryTriggerText);


    const characterListText = generateCharacterListText(characterTriggerText);
    const outfitEnableListText = generateOutfitEnableListText();
    const commonCharacterListText = generateCommonCharacterListText();



    // 定义所有占位符（用于诊断）
    const allPlaceholders = [
        "{{上下文}}",
        "{{世界书触发}}",
        "{{getvar::name}}",
        "{{正文}}",
        "{{角色启用列表}}",
        "{{通用角色启用列表}}",
        "{{通用服装启用列表}}",
        "{{用户需求}}",
    ];

    // ★ 使用新的 promptProcessor 模块进行处理
    // 1. 先合并相邻相同角色的消息
    promt = mergeAdjacentMessages(promt);


    // 2. 准备上下文数据用于占位符替换
    const contextData = {
        context: contextWithoutBody.join('\n'),
        body: nowtxt,
        worldBookContent: triggeredContent,
        variables: variables,
        userDemand: userDemand,
        characterListText: characterListText,
        outfitEnableListText: outfitEnableListText,
        commonCharacterListText: commonCharacterListText
    };

    // 3. 替换所有占位符
    const { messages: processedMessages, replacedVariables } = replaceAllPlaceholders(promt, contextData);
    promt = processedMessages;

    /**
     * 将图片附加到指定索引的消息中（OpenAI 多模态格式）
     * @param {Array} messages - 消息数组
     * @param {number} messageIndex - 要附加图片的消息索引
     * @param {string[]} images - base64 图片数组
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

        // 2. 添加图片标签说明（可选）
        if (images.length > 0) {
            contentParts.push({
                type: 'text',
                text: `\n[以下是用户上传的${images.length}张${imageLabel}]`
            });
        }

        // 3. 添加图片（支持 {base64, name} 对象格式）
        images.forEach((imgItem, idx) => {
            // 支持两种格式：纯 base64 字符串 或 {base64, name} 对象
            const imgBase64 = typeof imgItem === 'string' ? imgItem : imgItem.base64;
            const imgName = typeof imgItem === 'object' && imgItem.name ? imgItem.name : `${imageLabel}${idx + 1}`;

            // 添加图片名称标签
            contentParts.push({
                type: 'text',
                text: `[${imgName}]`
            });

            // 解析 base64 格式：data:image/jpeg;base64,xxx
            let imageUrl = imgBase64;

            // 如果不是完整的 data URL，添加前缀
            if (!imgBase64.startsWith('data:')) {
                imageUrl = `data:image/png;base64,${imgBase64}`;
            }

            contentParts.push({
                type: 'image_url',
                image_url: {
                    url: imageUrl,
                    detail: 'auto' // 可选: 'low', 'high', 'auto'
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
     * 查找包含用户需求内容的消息索引（用于附加图片）
     * @param {Array} messages - 消息数组
     * @returns {number} 消息索引，未找到返回 -1
     */
    function findUserDemandMessageIndex(messages) {
        // 策略：找最后一条 user 角色的消息
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                return i;
            }
        }
        return -1;
    }

    // ★ 找到用于附加图片的消息索引
    const userDemandMessageIndex = findUserDemandMessageIndex(promt);


    // ★ 将用户上传的图片附加到用户消息中（OpenAI 多模态格式）
    if (userUploadedImages.length > 0 && userDemandMessageIndex >= 0) {
        promt = attachImagesToMessage(promt, userDemandMessageIndex, userUploadedImages, '参考图片');

    }

    // ★ 收集并附加启用角色/服装中 sendPhoto 为 true 的图片
    try {
        // 收集启用角色的图片（基于触发文本过滤）
        const characterImages = await getEnabledCharacterImages(characterTriggerText);
        // 收集通用服装的图片
        const outfitImages = await getEnabledOutfitImages();
        // 收集通用角色的图片
        const commonCharacterImages = await getCommonCharacterImages();

        // 合并所有角色/服装图片
        const allCharacterOutfitImages = [...characterImages, ...outfitImages, ...commonCharacterImages];

        if (allCharacterOutfitImages.length > 0 && userDemandMessageIndex >= 0) {
            promt = attachImagesToMessage(promt, userDemandMessageIndex, allCharacterOutfitImages, '角色服装参考图片');

        }
    } catch (err) {
        console.error('[promptReq] 收集角色/服装图片失败:', err);
    }



    // 诊断信息
    let diagnosticText = "";
    if (replacedVariables.size > 0) {
        diagnosticText = `诊断：检测到以下变量被使用：${[...replacedVariables].join('、')}\n`;
    } else {
        diagnosticText = "诊断：没有检测到变量被使用。\n";
    }

    const unusedVariables = allPlaceholders.filter(p => !replacedVariables.has(p) && !p.includes('::'));
    if (unusedVariables.length > 0) {
        diagnosticText += `未使用的变量：${unusedVariables.join('、')}\n\n`;
    } else {
        diagnosticText += `所有基础变量都已使用。\n\n`;
    }




    updateCombinedPrompt(promt, diagnosticText);

    // ★ 检查正则测试模式：如果启用了测试模式，则停止 LLM 请求
    const isRegexTestMode = extension_settings[extensionName]?.regexTestMode ?? false;
    if (isRegexTestMode) {
        toastr.info('🧪 正则测试模式已启用：已停止 LLM 请求，仅展示最终 Prompt');

        return;
    }

    const llmResponse = await LLM_IMAGE_GEN(promt, { timeoutMs: 300000 });

    // 检查测试模式
    if (llmResponse.testMode) {

        return;
    }

    const next_promt = llmResponse.result;


    // 解析 LLM 输出中的 images（先移除 thinking 标签）
    const cleanedPrompt = removeThinkingTags(next_promt);
    const images = parseImagesFromPrompt(cleanedPrompt);


    // 将 images 插入到 el 元素的文本节点中
    if (images.length > 0 && el) {
        await insertImagesIntoElement(el, images);

        // ★ 自动点击生成：检查设置是否开启
        const autoClickEnabled = extension_settings[extensionName]?.zidongdianji === "true";
        if (autoClickEnabled) {
            // 导入任务队列
            const { taskQueue, TaskType, TaskStatus } = await import('./taskQueue.js');
            const { eventSource } = await import('../../../../../script.js');

            // 添加自动点击任务到队列
            const autoClickTaskId = taskQueue.addTask({
                name: `自动批量生图 (${images.length} 张)`,
                type: TaskType.AUTO_CLICK,
                prompt: `共 ${images.length} 个图片标签待处理`
            });

            // 更新状态为运行中
            taskQueue.updateStatus(autoClickTaskId, TaskStatus.RUNNING);

            // 设置全局变量允许自动点击，并存储任务ID
            window.zidongdianji = true;
            window.autoClickTaskId = autoClickTaskId;

            // 监听自动点击完成事件
            const completeHandler = (data) => {
                if (data.taskId === autoClickTaskId) {
                    taskQueue.completeTask(autoClickTaskId, data.success !== false);
                    eventSource.removeListener('st_chatu8_auto_click_complete', completeHandler);
                    window.autoClickTaskId = null;

                    // 根据 zidongdianji2 设置决定是否重置自动点击状态
                    if (extension_settings[extensionName]?.zidongdianji2 !== "true") {
                        setTimeout(() => {
                            window.zidongdianji = false;
                        }, 5000);
                    }
                }
            };
            eventSource.on('st_chatu8_auto_click_complete', completeHandler);

            // 延迟一小段时间后调用处理函数，确保 DOM 已更新
            setTimeout(() => {
                // 执行前检查任务是否被取消
                if (!taskQueue.isTaskInQueue(autoClickTaskId)) {
                    console.log('[promptReq] 自动点击任务已被取消');
                    window.zidongdianji = false;
                    window.autoClickTaskId = null;
                    eventSource.removeListener('st_chatu8_auto_click_complete', completeHandler);
                    return;
                }

                // 动态导入避免循环依赖
                import('./iframe/index.js').then(({ processAllImagePlaceholders }) => {
                    // 再次检查任务是否被取消
                    if (!taskQueue.isTaskInQueue(autoClickTaskId)) {
                        console.log('[promptReq] 自动点击任务已被取消');
                        window.zidongdianji = false;
                        window.autoClickTaskId = null;
                        eventSource.removeListener('st_chatu8_auto_click_complete', completeHandler);
                        return;
                    }

                    // 调用处理函数，任务完成会通过事件通知
                    processAllImagePlaceholders();
                }).catch(err => {
                    console.error('[promptReq] 加载 iframe 模块失败:', err);
                    taskQueue.completeTask(autoClickTaskId, false);
                    window.autoClickTaskId = null;
                    eventSource.removeListener('st_chatu8_auto_click_complete', completeHandler);
                });
            }, 100);
        }
    }
}
