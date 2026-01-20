// @ts-nocheck
/**
 * autoLLMClick.js - 自动LLM请求生图点击模块
 * 模仿 window.zidongdianji 的事件触发逻辑，但不包含消息滑动触发
 * 用于实现 config 中的 autoLLMImageGen 自动LLM请求生图功能
 */

import { eventSource, event_types } from "../../../../../../script.js";
import { extension_settings } from "../../../../../extensions.js";
import { extensionName } from '../config.js';
import { getContext } from "../../../../../st-context.js";
import { handlePromptRequest } from '../promptReq.js';

// 全局变量
let autoLLMClickTimer = null;
window.autoLLMClick = false;

// 生成开始时记录的数据，供 GENERATION_ENDED 使用
let generationStartChatLength = 0;
let generationStartSwipesLength = 0;

/**
 * 检查插件是否开启（兼容 boolean 和字符串类型）
 * @returns {boolean}
 */
function isPluginEnabled() {
    const scriptEnabled = extension_settings[extensionName]?.scriptEnabled;
    return scriptEnabled === true || scriptEnabled === "true";
}

/**
 * 检查是否启用了自动LLM请求生图功能
 * 需要同时满足：插件已开启 且 autoLLMImageGen 已开启
 * @returns {boolean}
 */
function isAutoLLMEnabled() {
    if (!isPluginEnabled()) {
        return false;
    }
    const autoLLMImageGen = extension_settings[extensionName]?.autoLLMImageGen;
    return autoLLMImageGen === true || autoLLMImageGen === "true";
}

/**
 * 查找真实的 mes_text 元素，如果找不到则创建虚拟元素
 * 优先使用真实 DOM 元素，确保图片能正确插入到页面中
 * @param {number} messageId - 消息 ID
 * @returns {HTMLElement} mes_text 元素或虚拟 el 元素
 */
function findOrCreateElement(messageId) {
    // 优先查找真实的 DOM 元素
    const realMesText = document.querySelector(`div.mes[mesid="${messageId}"] .mes_text`);

    if (realMesText) {
        console.log('[st-chatu8] Found real mes_text element for messageId:', messageId);
        return realMesText;
    }

    // 如果找不到真实元素，构建虚拟 DOM 结构: el -> parent -> grandParent[mesid]
    console.log('[st-chatu8] Real mes_text not found, creating virtual element for messageId:', messageId);
    const grandParent = document.createElement('div');
    grandParent.setAttribute('mesid', String(messageId));

    const parent = document.createElement('div');
    grandParent.appendChild(parent);

    const el = document.createElement('div');
    el.classList.add('mes_text');
    parent.appendChild(el);

    return el;
}

/**
 * 激活自动LLM点击状态
 */
function activateAutoLLMClick() {
    if (!isAutoLLMEnabled()) {
        return;
    }

    window.autoLLMClick = true;

    // 清除之前的定时器
    if (autoLLMClickTimer) {
        clearTimeout(autoLLMClickTimer);
    }

    // 5秒后自动关闭（除非 zidongdianji2 为 true 保持常开）

    autoLLMClickTimer = setTimeout(() => {
        window.autoLLMClick = false;
        autoLLMClickTimer = null;
    }, 5000);

}

// 事件监听：生成开始
eventSource.on(event_types.GENERATION_STARTED, (data) => {
    console.log('[st-chatu8] GENERATION_STARTED data:', data);

    const context = getContext();
    const chat = context?.chat;

    if (chat && chat.length > 0) {
        generationStartChatLength = chat.length;
        const lastMessage = chat[generationStartChatLength - 1];
        generationStartSwipesLength = lastMessage?.swipes?.length || 0;

        console.log('[st-chatu8] Chat array length:', generationStartChatLength);
        console.log('[st-chatu8] Last message swipes length:', generationStartSwipesLength);
    } else {
        generationStartChatLength = 0;
        generationStartSwipesLength = 0;
        console.log('[st-chatu8] Chat array is empty or not available');
    }
});

// 事件监听：生成结束
eventSource.on(event_types.GENERATION_ENDED, async (data) => {
    console.log('[st-chatu8] GENERATION_ENDED data:', data);
    console.log('[st-chatu8] Start chat length:', generationStartChatLength, 'Start swipes length:', generationStartSwipesLength);

    // 重新获取当前 chat 和 swipes 长度
    const context = getContext();
    const chat = context?.chat;
    const currentChatLength = chat?.length || 0;
    const currentLastMessage = chat && chat.length > 0 ? chat[chat.length - 1] : null;
    const currentSwipesLength = currentLastMessage?.swipes?.length || 0;

    console.log('[st-chatu8] Current chat length:', currentChatLength, 'Current swipes length:', currentSwipesLength);

    // 判断 chat 数组是否增加
    const isChatIncreased = currentChatLength > generationStartChatLength;

    // 只有当 chat 长度不变时，才检查 swipes 是否增加（比较的是同一条消息）
    // swipes 可能为 undefined/null/空数组，用 || 0 处理
    const isSwipesIncreased = !isChatIncreased && currentSwipesLength > generationStartSwipesLength;

    console.log('[st-chatu8] Chat increased:', isChatIncreased, 'Swipes increased:', isSwipesIncreased);

    // 如果 chat 没有增加 且 swipes 也没有增加，则跳过
    if (!isChatIncreased && !isSwipesIncreased) {
        console.log('[st-chatu8] No chat or swipes increase detected, skipping');
        return;
    }

    // 检查是否启用自动 LLM 请求生图
    if (!isAutoLLMEnabled()) {

        console.log('[st-chatu8] autoLLMImageGen is disabled, skipping');
        return;
    }

    // data 就是消息索引，-1 后为实际的消息 id
    const messageId = data - 1;

    if (messageId >= 0) {
        const context = getContext();
        const chat = context?.chat;

        if (chat && chat[messageId]) {
            const messageContent = chat[messageId].mes;
            console.log('[st-chatu8] Message ID:', messageId);
            console.log('[st-chatu8] Message content:', messageContent);

            // 检查消息内容长度，必须大于 200 才继续
            if (!messageContent || messageContent.length <= 200) {
                console.log('[st-chatu8] Message content too short (<=200), skipping. Length:', messageContent?.length || 0);
                return;
            }

            // 消息大于200时，自动开启"插入原文(非同层)"开关
            if (extension_settings[extensionName]?.insertOriginalText !== 'true') {
                extension_settings[extensionName].insertOriginalText = 'true';
                console.log('[st-chatu8] Auto-enabled insertOriginalText due to message length > 200');

                // 同步 UI 开关状态
                const insertTextSwitch = document.getElementById('insertOriginalText');
                if (insertTextSwitch) {
                    insertTextSwitch.checked = true;
                }

                // 触发正则脚本创建
                try {
                    const { saveSettingsDebounced } = await import('../../../../../../script.js');
                    saveSettingsDebounced();
                } catch (e) {
                    console.warn('[st-chatu8] Failed to save settings:', e);
                }
            }

            // 查找真实元素或构建虚拟 el 元素
            const el = findOrCreateElement(messageId);
            console.log('[st-chatu8] Got element for messageId:', messageId, 'isConnected:', el.isConnected);

            // 调用 handlePromptRequest，手势 ID 为 "gesture1"（手势一）
            try {
                console.log('[st-chatu8] Triggering handlePromptRequest with gesture1');
                handlePromptRequest(el, 'gesture1');
            } catch (error) {
                console.error('[st-chatu8] handlePromptRequest failed:', error);
            }
        } else {
            console.log('[st-chatu8] No message found for ID:', messageId);
        }
    }

    activateAutoLLMClick();
});

// 事件监听：JS 生成结束
eventSource.on("js_generation_ended", async (data) => {
    activateAutoLLMClick();
});

// 注意：不包含 MESSAGE_SWIPED 事件监听，按用户要求少一个消息滑动触发

/**
 * 手动设置自动LLM点击状态
 * @param {boolean} state - 状态
 */
export function setAutoLLMClick(state) {
    window.autoLLMClick = state;
}

/**
 * 获取当前自动LLM点击状态
 * @returns {boolean}
 */
export function getAutoLLMClick() {
    return window.autoLLMClick;
}

/**
 * 初始化自动LLM点击模块
 * 可在需要时调用此函数进行初始化
 */
export function initAutoLLMClick() {
    // 模块加载时自动注册事件监听
    // 初始化时可以添加额外的逻辑
    console.log('[st-chatu8] autoLLMClick module initialized');
}
