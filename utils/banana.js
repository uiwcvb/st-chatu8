// @ts-nocheck
import { extension_settings } from "../../../../extensions.js";
import { eventSource } from '../../../../../script.js';
import { extensionName, EventType } from './config.js';
import {
    sleep,
    generateRandomSeed,
    zhengmian,
    fumian,
    getRequestHeaders,
    prompt_replace,
    addLog,
    clearLog,
    parsePromptStringWithCoordinates,
    prompt_replace_for_character,
    stripChineseAnnotations,
    waitForLock,
    releaseLock,
    acquireLock,
} from './utils.js';
import { initializeImageProcessing } from './iframe.js';
import { processCharacterPrompt } from './characterprompt.js';
import { setItemImg } from './database.js';
import { getConfigImage } from './configDatabase.js';

/**
 * 从 turn 对象获取图片数据（兼容新旧格式）
 * @param {Object} data - user 或 model 对象
 * @returns {Promise<string>} Base64 图片数据或空字符串
 */
async function getImageFromTurnData(data) {
    if (!data) return '';

    // 新格式：使用 imageId
    if (data.imageId && data.imageId.startsWith('cfgimg_')) {
        const imageData = await getConfigImage(data.imageId);
        return imageData || '';
    }

    // 旧格式：直接存储 image
    if (data.image && data.image.startsWith('data:image')) {
        return data.image;
    }

    return '';
}
/**
 * The core function to generate an image using the "Banana" backend.
 * It routes requests based on the selected model (Gemini vs. Imagen).
 * @param {{ prompt: string, width?: number, height?: number, change?: string, retouchPrompt?: string, retouchImage?: string }} options
 * @returns {Promise<{image: string, change: string}>}
 */
async function generateBananaImage({ prompt, width, height, change, retouchPrompt, retouchImage }) {



    prompt = processCharacterPrompt(prompt);

    prompt = await stripChineseAnnotations(prompt)

    let change_ = change;



    change = processCharacterPrompt(change)

    change = await stripChineseAnnotations(change)


    addLog(`开始 Banana生图流程。客户端为${extension_settings[extensionName].client}`);
    addLog(`请求尺寸: 宽度 - ${width || '默认'}, 高度 - ${height || '默认'}`);

    prompt = (change && change.trim() !== '') ? change : prompt;

    addLog(`用于生成的Tag: ${prompt}`);

    let Divide_roles = false;
    if (prompt.includes("Scene Composition")) {
        Divide_roles = true;
    }
    addLog(`是否启用分角色模式 (Divide_roles): ${Divide_roles}`);


    let prompt_data = {};
    let mainPrompt = "";
    let other_prompt = "";

    if (Divide_roles) {
        addLog("分角色模式: 解析带坐标的提示词字符串。");
        prompt_data = parsePromptStringWithCoordinates(prompt);
        mainPrompt = prompt_data["Scene Composition"];

        for (let i = 1; i <= 4; i++) {
            if (prompt_data[`Character ${i} Prompt`]) {

                other_prompt = other_prompt + ", " + prompt_data[`Character ${i} Prompt`]

            }
        }
    } else {
        addLog("标准模式: 使用请求中的 prompt。");
        mainPrompt = prompt;
    }

    // 应用新的复杂提示词替换规则
    let { modifiedPrompt, insertions } = await prompt_replace(mainPrompt, other_prompt);


    if (Divide_roles) {
        for (let i = 1; i <= 4; i++) {
            if (prompt_data[`Character ${i} Prompt`]) {

                modifiedPrompt = modifiedPrompt + " | " + prompt_replace_for_character(prompt_data[`Character ${i} Prompt`])

            }
        }

    }




    const bananaSettings = extension_settings[extensionName].banana;
    const { model, apiUrl, apiKey, conversationPresets, conversationPresetId, editPresetId, aspectRatio } = bananaSettings;



    addLog(`[Banana] Starting image generation with model: ${model}`);

    let path;
    let payload;

    // 1. Build request payload based on the selected model
    if (model.startsWith('imagen')) {
        // --- Imagen (single-turn) Logic ---
        path = `/v1beta/models/${model}`;
        const preset = conversationPresets[conversationPresetId] || { fixedPrompt: '' };
        const finalPrompt = [
            preset.fixedPrompt,
            insertions['前置前'],
            insertions['前置后'],
            modifiedPrompt,
            insertions['后置前'],
            insertions['后置后'],
            preset.postfixPrompt,
            insertions['最后置']
        ].filter(Boolean).join(', ');

        addLog(`正面提示词: ${finalPrompt}`);

        payload = {
            instances: [{ prompt: finalPrompt }],
            parameters: {
                sampleCount: 1,
                aspectRatio: aspectRatio
            }
        };
        addLog(`[Banana] Built Imagen payload with prompt: ${finalPrompt}`);

    } else {
        // --- Multimodal (multi-turn) Logic for all other models ---
        path = '/v1/chat/completions';

        let preset;
        if (change.includes("{修图}")) {
            addLog("[Banana] 启用了 {修图} 标识。");
            const selectedEditPresetId = editPresetId || '默认';
            preset = conversationPresets[selectedEditPresetId] || { conversation: [], fixedPrompt: '' };
            addLog(`[Banana] 使用修图预设: "${selectedEditPresetId}"`);
        } else {
            preset = conversationPresets[conversationPresetId] || { conversation: [], fixedPrompt: '' };
        }

        const finalPrompt = [
            preset.fixedPrompt,
            insertions['前置前'],
            insertions['前置后'],
            modifiedPrompt,
            insertions['后置前'],
            insertions['后置后'],
            preset.postfixPrompt,
            insertions['最后置']
        ].filter(Boolean).join(', ');

        addLog(`正面提示词: ${finalPrompt}`);

        const history = preset.conversation
            .map(turn => [
                { role: 'user', content: [] },
                { role: 'assistant', content: [] }
            ])
            .flat();

        let currentHistoryIndex = 0;
        for (const turn of preset.conversation) {
            if (turn.user?.text) history[currentHistoryIndex].content.push({ type: 'text', text: turn.user.text });
            const userImage = await getImageFromTurnData(turn.user);
            if (userImage) history[currentHistoryIndex].content.push({ type: 'image_url', image_url: { url: userImage } });
            currentHistoryIndex++;
            if (turn.model?.text) history[currentHistoryIndex].content.push({ type: 'text', text: turn.model.text });
            const modelImage = await getImageFromTurnData(turn.model);
            if (modelImage) history[currentHistoryIndex].content.push({ type: 'image_url', image_url: { url: modelImage } });
            currentHistoryIndex++;
        }

        if (!change.includes("{修图}")) {
            const bananaCharacterPresets = extension_settings[extensionName].bananaCharacterPresets || {};

            for (const presetName in bananaCharacterPresets) {
                const charPreset = bananaCharacterPresets[presetName];
                const triggers = (charPreset.triggers || '').split('|').filter(t => t.trim() !== '');

                for (const trigger of triggers) {
                    if (finalPrompt.toLowerCase().includes(trigger.toLowerCase())) {
                        addLog(`[Banana] Found matching trigger "${trigger}" from preset "${presetName}".`);

                        const turn = charPreset.conversation;
                        if (turn) {
                            const userContent = [];
                            if (turn.user && turn.user.text) userContent.push({ type: 'text', text: turn.user.text });
                            const userImage = await getImageFromTurnData(turn.user);
                            if (userImage) userContent.push({ type: 'image_url', image_url: { url: userImage } });
                            if (userContent.length > 0) {
                                history.push({ role: 'user', content: userContent });
                            }

                            const modelContent = [];
                            if (turn.model && turn.model.text) modelContent.push({ type: 'text', text: turn.model.text });
                            const modelImage = await getImageFromTurnData(turn.model);
                            if (modelImage) modelContent.push({ type: 'image_url', image_url: { url: modelImage } });
                            if (modelContent.length > 0) {
                                history.push({ role: 'assistant', content: modelContent });
                            }
                        }
                        break;
                    }
                }
            }
        }

        if (!change.includes("{修图}")) {
            history.push({
                role: 'user',
                content: [{ type: 'text', text: finalPrompt }]
            });
        } else {
            // 修图模式：使用传入的修图指令和图片
            // 预设的对话历史已经加载到 history 中作为风格参考

            // 添加用户的修图请求（指令 + 待修改的图片）
            const userContent = [];

            // 添加修图指令
            const promptText = retouchPrompt || finalPrompt;
            const combinedPrompt = [preset.fixedPrompt, promptText, preset.postfixPrompt].filter(Boolean).join(', ');
            userContent.push({ type: 'text', text: combinedPrompt });

            // 添加待修改的图片
            if (retouchImage) {
                userContent.push({ type: 'image_url', image_url: { url: retouchImage } });
                addLog(`[Banana] 修图模式：已添加待修改的图片`);
            }

            history.push({
                role: 'user',
                content: userContent
            });

            addLog(`[Banana] 修图模式：指令 = ${combinedPrompt}`);
        }

        payload = {
            model: model,
            messages: history.filter(entry => entry.content.length > 0),
            config: {
                imageConfig: {
                    aspectRatio: aspectRatio
                }
            }
        };
        addLog(`[Banana] Built multimodal payload with ${payload.messages.length} messages.`);
    }

    // 智能拼接 URL：检测是否包含 v1
    let baseUrl = apiUrl.replace(/\/$/, '');
    let url;
    if (baseUrl.endsWith('/v1') || baseUrl.includes('/v1/')) {
        // 用户已提供 v1 路径，直接追加端点
        url = baseUrl + path;
    } else {
        // 用户未提供 v1，需要添加
        url = baseUrl + '/v1' + path;
    }
    // 处理 /v1/chat/completions 变成 /v1/v1/chat/completions 的情况
    url = url.replace(/\/v1\/v1\//g, '/v1/');

    addLog(`[Banana] Sending request to: ${url}`);
    addLog(`[Banana] Payload: ${JSON.stringify(payload, null, 2)}`);

    // 2. Perform the API call
    try {
        // 使用锁机制确保请求按顺序执行
        await waitForLock();
        acquireLock();

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }

        const result = await response.json();

        // Parse OpenAI format response to extract image
        let imageUrl = '';
        const choices = result.choices;
        if (choices && choices.length > 0) {
            const content = choices[0].message?.content;
            if (Array.isArray(content)) {
                // Find image_url in content array
                for (const item of content) {
                    if (item.type === 'image_url' && item.image_url?.url) {
                        imageUrl = item.image_url.url;
                        break;
                    }
                }
            } else if (typeof content === 'string') {
                // If content is a string (text only), no image
                addLog('[Banana] Response contains text only, no image.');
            }
        }

        if (!imageUrl) {
            throw new Error('API response did not contain image in OpenAI format');
        }

        releaseLock();
        addLog('[Banana] Image generated successfully.');
        return { image: imageUrl, change: change_ || '' };

    } catch (error) {
        releaseLock(); // 确保错误时也释放锁
        addLog(`[Banana] Fetch error: ${error.message}`);
        console.error('[Banana] Fetch error:', error);
        throw error; // Re-throw to be caught by the event handler
    }
}

/**
 * Event handler for GENERATE_IMAGE_REQUEST.
 * Wraps the core generation logic with event emission for success/failure.
 * @param {object} requestData 
 */
export async function bananaGenerate(requestData) {
    clearLog();
    let { id, prompt, width, height, change, retouchPrompt, retouchImage } = requestData;
    addLog(`[Banana] Received image generation request (ID: ${id})`);
    let change_ = ""
    if (change) {
        change_ = change.replaceAll('{修图}', '');
    } else {

        change_ = prompt
    }

    // --- 新增逻辑：处理修图请求 ---
    if (change && change.includes('{修图}')) {
        addLog(`Banana修图模式启动`);
        if (retouchPrompt) addLog(`修图指令: ${retouchPrompt}`);
        if (retouchImage) addLog(`修图图片: [已提供]`);
    }
    // --- 结束新增逻辑 ---

    try {
        const { image: imageUrl, change: returnedChange } = await generateBananaImage({ prompt, width, height, change, retouchPrompt, retouchImage });

        // TODO: Add caching logic if needed, similar to other backends
        // await setItemImg(prompt, imageUrl, { change: returnedChange });

        if (extension_settings[extensionName].cache != "0") {
            await setItemImg(prompt, imageUrl, { change: change_ });
            addLog(`图像已存入数据库 for prompt: ${prompt}`);

            if (extension_settings[extensionName].banana.cishu) {
                extension_settings[extensionName].banana.cishu = extension_settings[extensionName].banana.cishu + 1

                addLog(`当前生图次数为 for prompt: ${extension_settings[extensionName].banana.cishu}`);
            } else {
                extension_settings[extensionName].banana.cishu = 1

                addLog(`当前生图次数为 for prompt: ${extension_settings[extensionName].banana.cishu}`);
            }

        } else {

            addLog(`缓存设置为不存入数据库`);

        }

        eventSource.emit(EventType.GENERATE_IMAGE_RESPONSE, {
            id,
            success: true,
            imageData: imageUrl,
            prompt: prompt,
            change: change_,
        });
        addLog(`[Banana] Emitted success response for ID: ${id}`);

    } catch (error) {
        const errorMessage = `[Banana] Generation failed for ID ${id}: ${error.message}`;
        addLog(errorMessage);
        console.error(errorMessage);

        eventSource.emit(EventType.GENERATE_IMAGE_RESPONSE, {
            id,
            success: false,
            error: error.message,
            prompt: prompt,
        });
        addLog(`[Banana] Emitted failure response for ID: ${id}`);
    }
}

// 兼容旧版本的事件名
const LEGACY_EVENT_NAMES = [
    'generate-image-request',
    'generate_image_request'
];
/**
 * Initializes the event listener for Banana image generation.
 */
function initializeBananaListener() {
    eventSource.on(EventType.GENERATE_IMAGE_REQUEST, bananaGenerate);

    LEGACY_EVENT_NAMES.forEach(eventName => {
        eventSource.on(eventName, bananaGenerate);
    });
    addLog("banana 生图事件监听器已初始化。");
}

/**
 * Dynamically enables or disables the Banana backend based on settings.
 */
export async function replaceWithBanana() {
    if (extension_settings[extensionName].mode == "banana") {
        if (!window.initializeBananaListener) {
            window.initializeBananaListener = true;
            initializeBananaListener();
        }
        initializeImageProcessing(); // Activate UI placeholder processing
    } else {
        if (window.initializeBananaListener) {
            eventSource.removeListener(EventType.GENERATE_IMAGE_REQUEST, bananaGenerate);
            LEGACY_EVENT_NAMES.forEach(eventName => {
                eventSource.removeListener(eventName, bananaGenerate);
            });
            window.initializeBananaListener = false;
            addLog("[Banana] 生图事件监听器已关闭。");
        }
    }
}
