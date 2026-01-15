// @ts-nocheck
/**
 * chatDataUtils.js - 数据工具模块
 * 
 * 聊天数据读写和世界书获取工具函数
 */

import { getContext } from "../../../../st-context.js";
import { saveChatConditional, eventSource } from "../../../../../script.js";
import { world_names, world_info } from "../../../../world-info.js";
import { eventNames } from "./config.js";

/**
 * 设置聊天元数据
 * @param {string} name - 数据名称
 * @param {*} value - 数据值
 */
export async function setcharData(name, value) {
    let context = getContext();

    context.chatMetadata["st-chatu8"] = context.chatMetadata["st-chatu8"] || {};
    context.chatMetadata["st-chatu8"]["data"] = context.chatMetadata["st-chatu8"]["data"] || {};

    context.chatMetadata["st-chatu8"]["data"][name] = value;

    saveChatConditional();
}

/**
 * 获取聊天元数据
 * @param {string} name - 数据名称
 * @returns {*} 数据值
 */
export async function getcharData(name) {
    let context = getContext();

    context.chatMetadata["st-chatu8"] = context.chatMetadata["st-chatu8"] || {};
    context.chatMetadata["st-chatu8"]["data"] = context.chatMetadata["st-chatu8"]["data"] || {};

    return context.chatMetadata["st-chatu8"]["data"][name] || {};
}

/**
 * 获取元素上下文
 * @param {HTMLElement} el - DOM 元素
 * @param {number} maxCount - 最大消息数量
 * @returns {Promise<Array<string>>} 上下文文本数组
 */
export async function getElContext(el, maxCount = 3) {
    if (el) {
        if (el.classList.contains('mes_text')) {
            // 获取父元素的父类
            var grandParent = el.parentElement.parentElement;
            var id_str = grandParent.getAttribute('mesid');
            if (!id_str) {
                console.log('[chatDataUtils] mesid attribute not found.');
                return;
            }
            var id = parseInt(id_str, 10);

            console.log('[chatDataUtils] chatId:', id);

            // 从 context.chat 中获取文本，而不是从 DOM 元素
            const texts = [];
            if (id >= 2) {
                // 计算起始位置：从 id 往前推 (maxCount-1)*2 个位置，但不能小于0或1（保持奇偶性）
                let startId = id - (maxCount - 1) * 2;
                // 确保 startId 不小于 0，且与 id 保持相同的奇偶性
                if (startId < 0) {
                    startId = id % 2; // 如果 id 是偶数，startId 为 0；如果 id 是奇数，startId 为 1
                }

                let count = 0;
                let currentId = startId;
                while (currentId <= id && count < maxCount) {
                    const chatMessage = getContext().chat[currentId];

                    if ('swipes' in chatMessage) {
                        if (chatMessage && chatMessage.swipes && chatMessage.swipe_id !== undefined) {
                            const messageText = chatMessage.swipes[chatMessage.swipe_id] || '';
                            texts.push(messageText);
                        }
                    } else {
                        const messageText = chatMessage.mes || '';
                        texts.push(messageText);
                    }
                    currentId += 2;
                    count++;
                }
            } else {
                const chatMessage = getContext().chat[id];
                console.log('[chatDataUtils] Retrieved chatMessage:', chatMessage);

                if ('swipes' in chatMessage) {
                    if (chatMessage && chatMessage.swipes && chatMessage.swipe_id !== undefined) {
                        const messageText = chatMessage.swipes[chatMessage.swipe_id] || '';
                        texts.push(messageText);
                    }
                } else {
                    const messageText = chatMessage.mes || '';
                    texts.push(messageText);
                }
            }
            console.log('[chatDataUtils] Retrieved texts:', texts);

            const promises = texts.map((text, index) => {
                return new Promise((resolve) => {
                    const requestId = `chatDataUtils-${Date.now()}-${index}`;

                    // 添加超时机制，防止页面卡死
                    const timeoutId = setTimeout(() => {
                        eventSource.removeListener(eventNames.REGEX_RESULT_MESSAGE, listener);
                        console.warn('[chatDataUtils] Regex processing timed out, using original text');
                        resolve(text); // 超时后返回原始文本
                    }, 5000);

                    const listener = (data) => {
                        if (data.id === requestId) {
                            clearTimeout(timeoutId);
                            eventSource.removeListener(eventNames.REGEX_RESULT_MESSAGE, listener);
                            resolve(data.message);
                        }
                    };

                    eventSource.on(eventNames.REGEX_RESULT_MESSAGE, listener);
                    eventSource.emit(eventNames.REGEX_TEST_MESSAGE, { message: text, id: requestId });
                });
            });

            const retexts = await Promise.all(promises);
            console.log('[chatDataUtils] Processed retexts:', retexts);
            return retexts;

        } else {
            // 不包含 mes_text 类的元素，从当前 el 元素获取文本
            console.log('该元素不包含 mes_text 类，从 DOM 元素获取文本');
            let text = '';
            function getTextNodes(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    text += node.textContent;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    for (const child of node.childNodes) {
                        getTextNodes(child);
                    }
                }
            }
            getTextNodes(el);

            const requestId = `chatDataUtils-${Date.now()}`;
            const processedText = await new Promise((resolve) => {
                // 添加超时机制，防止页面卡死
                const timeoutId = setTimeout(() => {
                    eventSource.removeListener(eventNames.REGEX_RESULT_MESSAGE, listener);
                    console.warn('[chatDataUtils] Regex processing timed out, using original text');
                    resolve(text); // 超时后返回原始文本
                }, 5000);

                const listener = (data) => {
                    if (data.id === requestId) {
                        clearTimeout(timeoutId);
                        eventSource.removeListener(eventNames.REGEX_RESULT_MESSAGE, listener);
                        resolve(data.message);
                    }
                };
                eventSource.on(eventNames.REGEX_RESULT_MESSAGE, listener);
                eventSource.emit(eventNames.REGEX_TEST_MESSAGE, { message: text, id: requestId });
            });

            return [processedText];
        }
    } else {
        console.log('[chatDataUtils] No element provided.');
    }
}

/**
 * 获取所有世界书（当前角色世界书排在前面）
 * @returns {Promise<Array<string>>} 世界书名称数组
 */
export async function getrWorlds() {
    let worlds = world_names;

    let charworldName = await getcharWorld();

    console.log("charworldName", charworldName);

    worlds = unshiftSpecificValue(worlds, charworldName);

    return worlds;

    console.log('[chatDataUtils] Updated world_names:', worlds);
}

/**
 * 将数组中所有匹配的字符串移动到头部
 * @param {Array} arr - 原数组
 * @param {string} val - 需要置顶的字符串
 * @returns {Array} - 处理后的新数组
 */
function unshiftSpecificValue(arr, val) {
    const first = [];
    const rest = [];

    for (let i = 0; i < arr.length; i++) {
        if (arr[i] == val) {
            first.push(arr[i]);
        } else {
            rest.push(arr[i]);
        }
    }

    // 对剩余部分进行排序
    rest.sort((a, b) => a.localeCompare(b, 'zh-CN'));

    // 合并数组
    return first.concat(rest);
}

/**
 * 获取当前角色的世界书名称
 * @returns {Promise<string|undefined>} 世界书名称
 */
export async function getcharWorld() {
    let char_world_name = getContext().characters[getContext().characterId]?.data?.extensions?.world;

    console.log("char_world_name", char_world_name);

    return char_world_name;
}

/**
 * 获取全局选择的世界书
 * @returns {Promise<*>} 全局选择的世界书
 */
export async function getglobalSelectWorld() {
    const world = world_info.globalSelect;
    return world;
}

/**
 * 获取世界书条目
 * @param {string} world_name - 世界书名称
 * @returns {Promise<Object|undefined>} 世界书条目
 */
export async function getWorldEntries(world_name) {
    if (world_name) {
        try {
            let char_WorldInfo = await getContext().loadWorldInfo(world_name);
            if (char_WorldInfo && char_WorldInfo.entries) {
                console.log("char_WorldInfo", char_WorldInfo);
                return char_WorldInfo.entries;
            }
        } catch (e) {
            console.error(e);
        }
    } else {
        return;
    }
}

/**
 * 获取全局变量
 * @param {string} name - 变量名称
 * @returns {*} 变量值
 */
export function getglobalvar(name) {
    const context = getContext();
    const variables = context.extensionSettings?.variables || {};
    return variables[name];
}

/**
 * 设置全局变量
 * @param {string} name - 变量名称
 * @param {*} value - 变量值
 */
export function setglobalvar(name, value) {
    const context = getContext();
    if (!context.extensionSettings) {
        context.extensionSettings = {};
    }
    if (!context.extensionSettings.variables) {
        context.extensionSettings.variables = {};
    }
    context.extensionSettings.variables[name] = value;
}
