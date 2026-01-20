/* global toastr */
// @ts-nocheck
/**
 * llmService.js - LLM 核心服务层
 * 
 * 包含所有 LLM 核心业务逻辑（不依赖 DOM）：
 * - API 请求执行
 * - 配置获取
 * - 流处理
 * - 状态管理
 */

import { extension_settings } from "../../../../../extensions.js";
import { eventSource } from "../../../../../../script.js";
import { extensionName, eventNames, LLMRequestTypes } from "../config.js";
import { getRequestHeaders, clearLog, addLog } from "../utils.js";
import { startFabLoading, stopFabLoading } from "./fab.js";
import { checkTriggerWords, mergeAdjacentMessages } from "../promptProcessor.js";
import { processRollPlaceholders } from "./rollProcessor.js";
import { taskQueue, TaskType, TaskStatus } from "../taskQueue.js";

// ==================== 状态管理 ====================

let currentLLMRequestController = null;

// 存储任务 ID 与 AbortController 的关联
const llmTaskControllers = new Map();

// 监听 LLM 取消事件
eventSource.on('st_chatu8_cancel_llm_task', ({ taskId }) => {
    const controller = llmTaskControllers.get(taskId);
    if (controller) {
        controller.abort();
        llmTaskControllers.delete(taskId);
        console.log(`[LLM] 任务已取消: ${taskId}`);
    }
});

/**
 * 获取当前 LLM 请求控制器
 * @returns {AbortController|null}
 */
export function getLLMRequestController() {
    return currentLLMRequestController;
}

/**
 * 设置当前 LLM 请求控制器
 * @param {AbortController|null} controller
 */
export function setLLMRequestController(controller) {
    currentLLMRequestController = controller;
}

/**
 * 检查当前是否有正在进行的 LLM 请求。
 * @returns {boolean}
 */
export function isLLMRequestActive() {
    return !!currentLLMRequestController;
}

/**
 * 中止当前正在进行的 LLM 请求。
 */
export function abortLLMRequest() {
    if (currentLLMRequestController) {
        currentLLMRequestController.abort();
        toastr.info('LLM 请求已中止。');
    }
}


// ==================== 格式化工具 ====================

/**
 * 格式化 prompt 对象为可读的文本格式
 * @param {Array|Object|string} prompt - 要格式化的 prompt（可以是消息数组、对象或字符串）
 * @returns {string} 格式化后的文本
 */
export function formatPromptForDisplay(prompt) {
    // 如果已经是字符串，直接返回
    if (typeof prompt === 'string') {
        return prompt;
    }

    // 如果是消息数组（OpenAI Chat API 格式）
    if (Array.isArray(prompt)) {
        const formattedLines = [];

        prompt.forEach((message, index) => {
            const role = message.role || 'unknown';
            const roleLabel = getRoleLabel(role);

            formattedLines.push(`${'═'.repeat(50)}`);
            formattedLines.push(`【${roleLabel}】`);
            formattedLines.push(`${'─'.repeat(50)}`);

            // 处理 content（可能是字符串或数组，用于多模态）
            const content = message.content;
            if (typeof content === 'string') {
                formattedLines.push(content);
            } else if (Array.isArray(content)) {
                // 多模态内容
                content.forEach(part => {
                    if (part.type === 'text') {
                        formattedLines.push(part.text || '');
                    } else if (part.type === 'image_url') {
                        const imageUrl = part.image_url?.url || '';
                        if (imageUrl.startsWith('data:')) {
                            // 提取图片类型和大小信息
                            const mimeMatch = imageUrl.match(/^data:([^;]+);/);
                            const mimeType = mimeMatch ? mimeMatch[1] : 'unknown';
                            const base64Part = imageUrl.split(',')[1] || '';
                            const sizeKB = Math.round((base64Part.length * 3 / 4) / 1024);
                            formattedLines.push(`📷 [用户上传的图片: ${mimeType}, 约 ${sizeKB}KB]`);
                        } else {
                            formattedLines.push(`📷 [图片链接: ${imageUrl}]`);
                        }
                    }
                });
            }

            formattedLines.push('');
        });

        return formattedLines.join('\n');
    }

    // 如果是其他对象，尝试格式化
    if (typeof prompt === 'object' && prompt !== null) {
        return JSON.stringify(prompt, null, 2);
    }

    return String(prompt);
}

/**
 * 根据角色返回中文标签
 * @param {string} role - 角色名（system/user/assistant 等）
 * @returns {string} 中文标签
 */
export function getRoleLabel(role) {
    const roleMap = {
        'system': '系统提示词',
        'user': '用户',
        'assistant': 'AI助手',
        'function': '函数调用',
        'tool': '工具'
    };
    return roleMap[role] || role;
}

// ==================== 配置获取 ====================

/**
 * 获取当前选中的 LLM 配置
 * @returns {object} LLM 配置对象
 */
export function getCurrentLLMProfile() {
    const profiles = extension_settings[extensionName].llm_profiles || {};
    const currentProfileName = extension_settings[extensionName].current_llm_profile;
    return profiles[currentProfileName] || profiles[Object.keys(profiles)[0]] || {};
}

/**
 * 获取当前选中的测试上下文
 * @returns {object} 测试上下文对象
 */
export function getCurrentTestContext() {
    const contexts = extension_settings[extensionName].test_context_profiles || {};
    const currentContextName = extension_settings[extensionName].current_test_context_profile;
    return contexts[currentContextName] || contexts[Object.keys(contexts)[0]] || {};
}

/**
 * 获取指定请求类型的有效配置（从选择的预设中获取配置）
 * @param {string} requestType - 请求类型
 * @returns {object} 配置对象，包含 LLM 配置和上下文配置
 */
export function getEffectiveConfigForRequestType(requestType) {
    const configs = extension_settings[extensionName].llm_request_type_configs || {};
    const typeConfig = configs[requestType] || { api_profile: '默认', context_profile: '默认' };

    const llmProfiles = extension_settings[extensionName].llm_profiles || {};
    const contextProfiles = extension_settings[extensionName].test_context_profiles || {};

    // 获取选择的 API 配置预设
    const apiProfileName = typeConfig.api_profile || '默认';
    const apiProfile = llmProfiles[apiProfileName] || llmProfiles[Object.keys(llmProfiles)[0]] || {};

    // 获取选择的上下文预设
    const contextProfileName = typeConfig.context_profile || '默认';
    const contextProfile = contextProfiles[contextProfileName] || contextProfiles[Object.keys(contextProfiles)[0]] || {};

    return {
        // LLM API 配置
        api_url: apiProfile.api_url || '',
        api_key: apiProfile.api_key || '',
        model: apiProfile.model || '',
        temperature: apiProfile.temperature ?? 0.7,
        top_p: apiProfile.top_p ?? 1.0,
        max_tokens: apiProfile.max_tokens ?? 512,
        stream: apiProfile.stream ?? false,
        bypass_proxy: apiProfile.bypass_proxy ?? false,
        // 上下文配置
        context: contextProfile
    };
}

/**
 * 根据请求类型构建对应的提示词
 * @param {string} requestType - 请求类型
 * @param {string} [triggerText] - 可选的触发文本，用于触发词过滤
 * @returns {Array} 消息数组
 */
export function buildPromptForRequestType(requestType, triggerText = '') {
    const configs = extension_settings[extensionName].llm_request_type_configs || {};
    const typeConfig = configs[requestType] || { context_profile: '默认' };
    const contextProfileName = typeConfig.context_profile || '默认';

    const contextProfiles = extension_settings[extensionName].test_context_profiles || {};
    const contextProfile = contextProfiles[contextProfileName] || contextProfiles[Object.keys(contextProfiles)[0]] || {};

    const messages = [];

    // 新格式：使用 entries 数组
    if (contextProfile.entries && Array.isArray(contextProfile.entries)) {
        contextProfile.entries.forEach(entry => {
            // 跳过禁用的条目
            if (!entry.enabled) return;
            // 跳过空内容
            if (!entry.content || entry.content.trim() === '') return;

            // 触发模式逻辑
            if (entry.triggerMode === 'trigger') {
                // 触发模式：检查触发词是否在触发文本中出现
                if (!triggerText || !checkTriggerWords(entry.triggerWords, triggerText)) {
                    return; // 未触发，跳过此条目
                }
            }
            // 'always' 模式或未指定模式：直接包含

            messages.push({ role: entry.role || 'user', content: entry.content });
        });
    }
    // 兼容旧格式：使用 history 数组
    else if (contextProfile.history && Array.isArray(contextProfile.history)) {
        contextProfile.history.forEach(h => {
            if (h.user && h.user.trim() !== '') {
                messages.push({ role: "user", content: h.user });
            }
            if (h.assistant && h.assistant.trim() !== '') {
                messages.push({ role: "assistant", content: h.assistant });
            }
        });
    }

    // ★ 合并相邻相同角色的消息
    const mergedMessages = mergeAdjacentMessages(messages);

    // ★ 处理 {{roll N}} 占位符
    const processedMessages = processRollPlaceholders(mergedMessages);

    return processedMessages;
}

// ==================== LLM 请求执行 ====================

/**
 * 请求类型名称映射
 */
const REQUEST_TYPE_NAMES = {
    'image_gen': '正文图片生成',
    'char_design': '角色/服装设计',
    'char_display': '角色/服装展示',
    'char_modify': '角色/服装修改',
    'translation': '翻译',
    'tag_modify': 'Tag修改'
};

/**
 * 通用的 LLM 请求执行函数
 * @param {object} data - 事件数据，包含 { prompt, id }
 * @param {string} requestType - 请求类型
 * @param {string} responseEventName - 响应事件名称
 * @param {function} [updateResultUI] - 可选的 UI 更新回调函数
 */
export async function executeTypedLLMRequest(data, requestType, responseEventName, updateResultUI = null) {
    const { prompt, id } = data;
    if (!id || !prompt) return;

    if (currentLLMRequestController) {
        currentLLMRequestController.abort();
        toastr.info('LLM请求已中断，开始新请求。');
    }
    currentLLMRequestController = new AbortController();
    const signal = currentLLMRequestController.signal;

    // 保存当前控制器的引用，用于在 finally 中检查是否被新请求替换
    const thisController = currentLLMRequestController;

    const typeName = REQUEST_TYPE_NAMES[requestType] || requestType;

    // 添加任务到队列
    const taskId = taskQueue.addTask({
        name: `LLM: ${typeName}`,
        type: TaskType.LLM,
        prompt: id
    });

    // 存储任务 ID 与 AbortController 的关联
    llmTaskControllers.set(taskId, currentLLMRequestController);

    // 更新任务状态为运行中
    taskQueue.updateStatus(taskId, TaskStatus.RUNNING);

    // 启动悬浮球加载动画
    startFabLoading();

    // 标记是否被 abort
    let isAborted = false;

    // 清除日志并记录请求的 prompt
    clearLog();
    addLog(`===== LLM 请求开始 (${typeName}) =====`);
    addLog(`请求 ID: ${id}`);
    addLog(`发送的 Prompt:`);
    addLog(formatPromptForDisplay(prompt));

    const config = getEffectiveConfigForRequestType(requestType);
    const { api_url, api_key, model, temperature, top_p, max_tokens, stream, bypass_proxy } = config;

    if (!api_url || !api_key || !model) {
        const errorMsg = `${typeName}: API URL, API Key, 或 Model 未配置。`;
        toastr.error(errorMsg);
        eventSource.emit(responseEventName, { success: false, result: errorMsg, id: id });
        return;
    }

    // 根据 bypass_proxy 决定请求方式
    const customApiUrl = api_url.replace(/\/$/, '');
    let requestUrl, requestHeaders, requestBody;

    if (bypass_proxy) {
        // 直接请求 OpenAI 格式 API（绕过酒馆代理）
        requestUrl = `${customApiUrl}/chat/completions`;
        requestHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api_key}`
        };
        requestBody = {
            model: model,
            messages: prompt,
            temperature: temperature,
            top_p: top_p,
            max_tokens: max_tokens,
            stream: stream,
        };
    } else {
        // 使用 SillyTavern 后端代理，避免 CORS 问题
        requestUrl = '/api/backends/chat-completions/generate';
        requestHeaders = getRequestHeaders(window.token);
        requestBody = {
            chat_completion_source: 'custom',
            custom_url: customApiUrl,
            custom_include_headers: `Authorization: "Bearer ${api_key}"`,
            model: model,
            messages: prompt,
            temperature: temperature,
            top_p: top_p,
            max_tokens: max_tokens,
            stream: stream,
        };
    }

    if (updateResultUI) {
        updateResultUI(`正在处理 ${typeName} 请求，请稍候...`);
    }

    try {
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
            signal,
        });

        if (!response.ok) {
            // 尝试解析错误响应
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    let errorMsg;
                    if (typeof errorData.error === 'object' && errorData.error.message) {
                        errorMsg = `${errorData.error.message}`;
                        const details = [];
                        if (errorData.error.type) details.push(`类型: ${errorData.error.type}`);
                        if (errorData.error.code) details.push(`代码: ${errorData.error.code}`);
                        if (details.length > 0) {
                            errorMsg += ` (${details.join(', ')})`;
                        }
                    } else {
                        errorMsg = `${JSON.stringify(errorData.error)}`;
                    }
                    throw new Error(errorMsg);
                }
            } catch (parseError) {
                if (parseError.message.includes('类型:') || parseError.message.includes('代码:')) {
                    throw parseError;
                }
            }
            throw new Error(`请求失败: ${response.status} ${response.statusText}`);
        }

        let reply = '';

        if (stream) {
            // 流式处理：使用 SSE 读取
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

                    if (trimmedLine.startsWith('data: ')) {
                        try {
                            const jsonStr = trimmedLine.slice(6);
                            const chunk = JSON.parse(jsonStr);
                            const delta = chunk.choices?.[0]?.delta?.content;
                            if (delta) {
                                reply += delta;
                                if (updateResultUI) {
                                    updateResultUI(reply);
                                }
                            }
                        } catch (e) {
                            // 忽略解析错误，可能是不完整的 JSON
                            console.warn('流式解析警告:', e.message);
                        }
                    }
                }
            }

            // 处理最后剩余的 buffer
            if (buffer.trim() && buffer.trim() !== 'data: [DONE]' && buffer.trim().startsWith('data: ')) {
                try {
                    const jsonStr = buffer.trim().slice(6);
                    const chunk = JSON.parse(jsonStr);
                    const delta = chunk.choices?.[0]?.delta?.content;
                    if (delta) {
                        reply += delta;
                        if (updateResultUI) {
                            updateResultUI(reply);
                        }
                    }
                } catch (e) {
                    console.warn('流式解析警告 (最后buffer):', e.message);
                }
            }

            if (!reply) {
                reply = '未收到有效回复。';
                toastr.warning(`${typeName}: LLM 未收到有效回复。`);
            }
        } else {
            // 非流式处理：常规 JSON 响应
            const responseData = await response.json();

            if (responseData.error) {
                let errorMsg;
                if (typeof responseData.error === 'object' && responseData.error.message) {
                    errorMsg = `${responseData.error.message}`;
                    const details = [];
                    if (responseData.error.type) details.push(`类型: ${responseData.error.type}`);
                    if (responseData.error.code) details.push(`代码: ${responseData.error.code}`);
                    if (details.length > 0) {
                        errorMsg += ` (${details.join(', ')})`;
                    }
                } else {
                    errorMsg = `${JSON.stringify(responseData.error)}`;
                }
                throw new Error(errorMsg);
            }

            reply = responseData.choices?.[0]?.message?.content || '';
            if (!reply) {
                reply = '未收到有效回复。';
                toastr.warning(`${typeName}: LLM 未收到有效回复。`);
            }
            if (updateResultUI) {
                updateResultUI(reply);
            }
        }

        // 记录 LLM 回复到日志
        addLog(`\n----- LLM 回复 -----`);
        addLog(reply);
        addLog(`===== LLM 请求完成 =====`);

        // 更新任务状态为完成
        taskQueue.completeTask(taskId, true);
        llmTaskControllers.delete(taskId);


        eventSource.emit(responseEventName, { success: true, result: reply, id: id, testMode: false });

    } catch (error) {
        if (error.name === 'AbortError') {
            // 标记为已 abort
            isAborted = true;
            // 更新任务状态为已取消
            taskQueue.updateStatus(taskId, TaskStatus.CANCELLED);
            llmTaskControllers.delete(taskId);
            eventSource.emit(responseEventName, {
                success: false,
                result: null,
                id: id,
                error: { name: 'AbortError', message: 'Request aborted' }
            });
            return;
        }
        console.error(`${typeName} Error:`, error);
        const errorMessage = `请求错误: ${error.message}`;
        if (updateResultUI) {
            updateResultUI(errorMessage);
        }
        toastr.error(error.message);
        // 更新任务状态为失败
        taskQueue.completeTask(taskId, false);
        llmTaskControllers.delete(taskId);
        eventSource.emit(responseEventName, { success: false, result: errorMessage, id: id });
    } finally {
        // 只有当这是当前活动的控制器时才清空，避免清除新请求的控制器
        if (currentLLMRequestController === thisController) {
            currentLLMRequestController = null;
        }
        // 如果是被 abort 且有新请求正在进行，则不停止动画
        // 检查是否有新的请求接管了（currentLLMRequestController 不为 null 且不是当前控制器）
        if (!isAborted || currentLLMRequestController === null) {
            // 停止悬浮球加载动画
            stopFabLoading();
        }
    }
}

/**
 * 通用的 LLM 执行请求处理（使用 UI 中配置的默认 profile）
 * @param {object} data - 事件数据，包含 { prompt, id }
 * @param {object} profileData - 配置数据（从 UI 收集）
 * @param {function} [updateResultUI] - 可选的 UI 更新回调函数
 */
export async function executeDefaultLLMRequest(data, profileData, updateResultUI = null) {
    const { prompt, id } = data;
    if (!id || !prompt) return;

    if (currentLLMRequestController) {
        currentLLMRequestController.abort();
        toastr.info('LLM请求已中断，开始新请求。');
    }
    currentLLMRequestController = new AbortController();
    const signal = currentLLMRequestController.signal;

    // 保存当前控制器的引用，用于在 finally 中检查是否被新请求替换
    const thisController = currentLLMRequestController;

    // 添加任务到队列
    const taskId = taskQueue.addTask({
        name: 'LLM: 外部请求',
        type: TaskType.LLM,
        prompt: id
    });

    // 存储任务 ID 与 AbortController 的关联
    llmTaskControllers.set(taskId, currentLLMRequestController);

    // 更新任务状态为运行中
    taskQueue.updateStatus(taskId, TaskStatus.RUNNING);

    // 启动悬浮球加载动画
    startFabLoading();

    // 标记是否被 abort
    let isAborted = false;

    // 清除日志并记录请求的 prompt
    clearLog();
    addLog(`===== LLM 默认请求开始 =====`);
    addLog(`请求 ID: ${id}`);
    addLog(`发送的 Prompt:`);
    addLog(formatPromptForDisplay(prompt));

    const { api_url, api_key, model, temperature, top_p, max_tokens, stream, bypass_proxy } = profileData;

    if (!api_url || !api_key || !model) {
        const errorMsg = "API URL, API Key, 或 Model 未配置。";
        toastr.error(errorMsg);
        eventSource.emit(eventNames.LLM_EXECUTE_RESPONSE, { success: false, result: errorMsg, id: id });
        return;
    }

    // 根据 bypass_proxy 决定请求方式
    const customApiUrl = api_url.replace(/\/$/, '');
    let requestUrl, requestHeaders, requestBody;

    if (bypass_proxy) {
        // 直接请求 OpenAI 格式 API（绕过酒馆代理）
        requestUrl = `${customApiUrl}/chat/completions`;
        requestHeaders = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api_key}`
        };
        requestBody = {
            model: model,
            messages: prompt,
            temperature: temperature,
            top_p: top_p,
            max_tokens: max_tokens,
            stream: stream ?? false,
        };
    } else {
        // 使用 SillyTavern 后端代理，避免 CORS 问题
        requestUrl = '/api/backends/chat-completions/generate';
        requestHeaders = getRequestHeaders(window.token);
        requestBody = {
            chat_completion_source: 'custom',
            custom_url: customApiUrl,
            custom_include_headers: `Authorization: "Bearer ${api_key}"`,
            model: model,
            messages: prompt,
            temperature: temperature,
            top_p: top_p,
            max_tokens: max_tokens,
            stream: false,
        };
    }

    if (updateResultUI) {
        updateResultUI("正在处理外部请求，请稍候...");
    }

    try {
        const response = await fetch(requestUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
            signal,
        });

        const responseData = await response.json();

        if (responseData.error) {
            let errorMsg;
            if (typeof responseData.error === 'object' && responseData.error.message) {
                errorMsg = `${responseData.error.message}`;
                const details = [];
                if (responseData.error.type) details.push(`类型: ${responseData.error.type}`);
                if (responseData.error.code) details.push(`代码: ${responseData.error.code}`);
                if (details.length > 0) {
                    errorMsg += ` (${details.join(', ')})`;
                }
            } else {
                errorMsg = `${JSON.stringify(responseData.error)}`;
            }
            throw new Error(errorMsg);
        }

        if (!response.ok) {
            throw new Error(`请求失败: ${response.status} ${response.statusText}`);
        }

        const reply = responseData.choices?.[0]?.message?.content || "";
        if (!reply) {
            toastr.warning('LLM 未收到有效回复。');
        }
        if (updateResultUI) {
            updateResultUI(reply);
        }

        // 记录 LLM 回复到日志
        addLog(`\n----- LLM 回复 -----`);
        addLog(reply);
        addLog(`===== LLM 请求完成 =====`);

        // 更新任务状态为完成
        taskQueue.completeTask(taskId, true);
        llmTaskControllers.delete(taskId);

        eventSource.emit(eventNames.LLM_EXECUTE_RESPONSE, { success: true, result: reply, id: id });

    } catch (error) {
        if (error.name === 'AbortError') {
            // 标记为已 abort
            isAborted = true;
            console.log('LLM execute request aborted.');
            // 更新任务状态为已取消
            taskQueue.updateStatus(taskId, TaskStatus.CANCELLED);
            llmTaskControllers.delete(taskId);
            eventSource.emit(eventNames.LLM_EXECUTE_RESPONSE, {
                success: false,
                result: null,
                id: id,
                error: { name: 'AbortError', message: 'Request aborted' }
            });
            return;
        }
        console.error("LLM Execute Error:", error);
        const errorMessage = `请求错误: ${error.message}`;
        if (updateResultUI) {
            updateResultUI(errorMessage);
        }
        toastr.error(error.message);
        // 更新任务状态为失败
        taskQueue.completeTask(taskId, false);
        llmTaskControllers.delete(taskId);
        eventSource.emit(eventNames.LLM_EXECUTE_RESPONSE, { success: false, result: errorMessage, id: id });
    } finally {
        // 只有当这是当前活动的控制器时才清空，避免清除新请求的控制器
        if (currentLLMRequestController === thisController) {
            currentLLMRequestController = null;
        }
        // 如果是被 abort 且有新请求正在进行，则不停止动画
        // 检查是否有新的请求接管了（currentLLMRequestController 不为 null 且不是当前控制器）
        if (!isAborted || currentLLMRequestController === null) {
            // 停止悬浮球加载动画
            stopFabLoading();
        }
    }
}

// ==================== 请求类型处理器 ====================

/**
 * 创建请求类型的 GetPrompt 处理器
 * @param {string} requestType - 请求类型
 * @param {string} responseEventName - 响应事件名称
 * @returns {function} 处理器函数
 */
export function createGetPromptHandler(requestType, responseEventName) {
    return function (data) {
        const { id } = data;
        if (!id) return;

        const typeName = REQUEST_TYPE_NAMES[requestType] || requestType;
        console.log(`st-chatu8: 收到${typeName}提示词获取请求 (ID: ${id})`);
        const prompt = buildPromptForRequestType(requestType);
        eventSource.emit(responseEventName, { prompt: prompt, id: id });
    };
}

/**
 * 创建请求类型的 Execute 处理器
 * @param {string} requestType - 请求类型
 * @param {string} responseEventName - 响应事件名称
 * @param {function} [getUpdateResultUI] - 获取 UI 更新回调的函数
 * @returns {function} 处理器函数
 */
export function createExecuteHandler(requestType, responseEventName, getUpdateResultUI = null) {
    return async function (data) {
        const updateResultUI = getUpdateResultUI ? getUpdateResultUI() : null;
        await executeTypedLLMRequest(data, requestType, responseEventName, updateResultUI);
    };
}
