// @ts-nocheck
/**
 * 文本占位符查找和替换
 */

import { extension_settings } from "../../../../../extensions.js";
import { eventSource } from "../../../../../../script.js";
import { extensionName, EventType } from '../config.js';
import { getItemImg } from '../database.js';
import { getcharData } from '../promptReq.js';
import { findNodeAtPosition, generateStableId, generateElKey } from './utils.js';
import { createAndShowImage, triggerGeneration } from './generation.js';
import { showEditDialog } from './dialogs.js';

/**
 * 检查保存的 image groups，使用 el 中间 20 字符作为 key 查找
 * 返回需要创建按钮的匹配信息列表（不直接修改 DOM）
 * @param {string} logicalText - 当前元素的逻辑文本
 * @param {HTMLElement} rootElement - 根元素（用于检查是否已存在按钮/图片）
 * @returns {Promise<Array<{content: string, insertPosition: number}>>} 需要创建按钮的匹配列表
 */
export async function getSavedImageMatches(logicalText, rootElement) {
    const result = [];
    try {
        const imageGroups = await getcharData('image_groups') || {};

        // 使用中间 20 字符作为 key 直接查找（O(1)）
        const elKey = generateElKey(logicalText);
        if (!elKey) return result;

        const images = imageGroups[elKey];
        if (!Array.isArray(images) || images.length === 0) return result;

        // 检查是否已存在 image 元素
        const existingImage = rootElement.querySelector(`.st-chatu8-image-container`);
        if (existingImage) {
            return result;
        }

        // 遍历每个保存的 tag，检查是否需要创建按钮
        for (const img of images) {
            const imageTagText = `image###${img.tag}###`;
            const textHasTag = logicalText.includes(imageTagText);
            // 检查是否已存在按钮（选择器会匹配所有状态的按钮，包括正在加载中的）
            const existingButton = rootElement.querySelector(
                `button.image-tag-button[data-link="${CSS.escape(img.tag)}"], button.image-tag-button[data-image-tag="${CSS.escape(img.tag)}"]`
            );

            if (!existingButton && !textHasTag) {
                result.push({
                    content: img.tag,
                    insertPosition: img.endIndex
                });
            }
        }

        if (result.length > 0) {
            console.log('[iframe] Matched image group by key:', elKey, 'tags:', result.length);
        }
    } catch (e) {
        console.error('[iframe] Error in getSavedImageMatches:', e);
    }
    return result;
}

/**
 * 在指定位置创建并插入按钮和 imgSpan（直接创建元素，不插入文本标签）
 * @param {number} insertPosition - 插入位置（在 logicalText 中的索引）
 * @param {string} tag - 图片标签内容
 * @param {Array} nodeInfos - 节点信息数组
 * @param {Document} doc - 文档对象
 * @param {HTMLElement} rootElement - 根元素
 * @param {object} settings - 扩展设置
 * @param {boolean} shouldAutoClickBatch - 是否应该自动点击
 * @param {string} imageAlt - 图片替代文本
 * @returns {Promise<HTMLButtonElement|null>} 如果需要自动点击，返回按钮；否则返回 null
 */
export async function createButtonAtPosition(insertPosition, tag, nodeInfos, doc, rootElement, settings, shouldAutoClickBatch, imageAlt = 'Generated Image') {
    const link = tag.replaceAll("《", "<").replaceAll("》", ">").replaceAll("\n", "");
    const requestId = generateStableId(link);
    const tagInsertedMarker = `tag-inserted-${requestId}`;

    // 检测1：检查该tag是否已被插入（使用独立的tag插入标记）
    const tagMarkerAttr = `data-${tagInsertedMarker}`;
    if (rootElement.hasAttribute && rootElement.hasAttribute(tagMarkerAttr)) {
        // 检查按钮是否真的存在，如果不存在则清除标记并继续
        const existingButton = rootElement.querySelector(
            `button.image-tag-button[data-link="${CSS.escape(link)}"], button.image-tag-button[data-image-tag="${CSS.escape(link)}"]`
        );
        if (existingButton) {
            console.log('[iframe] Tag already inserted with button, skipping:', tag.substring(0, 50));
            return null;
        } else {
            // 标记存在但按钮不存在（可能被编辑删除了），清除标记并继续插入
            console.log('[iframe] Tag marker exists but button missing, re-inserting:', tag.substring(0, 50));
            rootElement.removeAttribute(tagMarkerAttr);
        }
    }

    // 检测2：检查是否已存在具有该 tag 的按钮（按钮生成的独立检测）
    const existingButton = rootElement.querySelector(
        `button.image-tag-button[data-link="${CSS.escape(link)}"], button.image-tag-button[data-image-tag="${CSS.escape(link)}"]`
    );
    if (existingButton) {
        console.log('[iframe] Button already exists, skipping:', link.substring(0, 50), 'loading:', existingButton.hasAttribute('data-loading'));
        // 即使按钮已存在，也标记tag已插入
        if (rootElement.setAttribute) {
            rootElement.setAttribute(tagMarkerAttr, 'true');
        }
        return null;
    }

    // 使用二分查找定位节点 (O(log n))
    const targetNodeInfo = findNodeAtPosition(nodeInfos, insertPosition);
    if (!targetNodeInfo) {
        console.warn('[iframe] Could not find target node for position:', insertPosition);
        return null;
    }

    // 标记该tag已插入（在创建按钮之前标记，防止并发重复插入）
    if (rootElement.setAttribute) {
        rootElement.setAttribute(tagMarkerAttr, 'true');
    }

    // 创建按钮
    const button = doc.createElement('button');
    button.className = 'image-tag-button st-chatu8-image-button';
    button.textContent = '生成图片';
    button.dataset.link = link;
    button.dataset.requestId = requestId;
    button.dataset.imageTag = link;

    // 添加事件监听器
    let pressTimer = null;
    let isLongPress = false;
    const longPressThreshold = 1200;

    const handlePressStart = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        isLongPress = false;
        pressTimer = setTimeout(() => {
            isLongPress = true;
            pressTimer = null;
            e.preventDefault();
            if (settings.longPressToEdit == "true") {
                showEditDialog(null, button);
            }
        }, longPressThreshold);
    };

    const handlePressEnd = () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    };

    button.addEventListener('click', (e) => {
        if (isLongPress) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        e.preventDefault();
        triggerGeneration(button);
    });

    button.addEventListener('mousedown', handlePressStart);
    button.addEventListener('mouseup', handlePressEnd);
    button.addEventListener('mouseleave', handlePressEnd);
    button.addEventListener('touchstart', handlePressStart);
    button.addEventListener('touchend', handlePressEnd);
    button.addEventListener('touchcancel', handlePressEnd);

    // 创建 imgSpan
    const imgSpan = doc.createElement('span');
    imgSpan.className = 'st-chatu8-image-span';
    imgSpan.dataset.requestId = requestId;

    // 在目标位置插入按钮和 imgSpan
    const range = doc.createRange();
    try {
        const targetNode = targetNodeInfo.node;
        const offsetInNode = insertPosition - targetNodeInfo.start;

        if (targetNode.nodeType === Node.TEXT_NODE) {
            range.setStart(targetNode, offsetInNode);
            range.setEnd(targetNode, offsetInNode);
        } else {
            range.setStartAfter(targetNode);
            range.setEndAfter(targetNode);
        }

        // insertNode 在 range 起始位置插入，后插入的在前面
        range.insertNode(imgSpan);
        range.insertNode(button);
    } catch (e) {
        console.error('[iframe] Error inserting button at position:', e);
        return null;
    }

    // 异步加载图片或返回供自动点击的按钮
    const [imageUrl, change, , isVideo] = await getItemImg(link);
    if (imageUrl) {
        createAndShowImage(imgSpan, imageUrl, imageAlt, button, change, isVideo);
        if (settings.dbclike === "true") {
            button.style.setProperty('display', 'none', 'important');
        }
    } else {
        if (shouldAutoClickBatch) {
            console.log('[iframe] 自动点击 saved button:', button);
            return button;
        }
    }
    return null;
}

/**
 * Core worker function to find and replace placeholders within a given root element
 * @param {HTMLElement} rootElement - 根元素
 * @param {string} imageAlt - 图片替代文本
 */
export async function findAndReplaceInElement(rootElement, imageAlt = 'Generated Image') {
    if (!rootElement) {
        return;
    }

    // 如果元素已经被处理过，检查按钮是否仍然存在
    if (rootElement.dataset && rootElement.dataset.chatu8Processed === 'true') {
        // 检查是否有任何按钮存在，如果没有则清除标记并继续处理
        const anyButton = rootElement.querySelector('button.image-tag-button');
        if (anyButton) {
            return; // 有按钮，跳过处理
        } else {
            // 没有按钮（可能被编辑删除了），清除标记并继续处理
            console.log('[iframe] Element marked processed but no buttons found, re-processing');
            delete rootElement.dataset.chatu8Processed;
        }
    }

    // 如果元素内有正在加载中的按钮，跳过处理，防止重复创建
    const loadingButton = rootElement.querySelector('button.image-tag-button[data-loading="true"]');
    if (loadingButton) {
        console.log('[iframe] Element has loading button, skipping processing');
        return;
    }

    const settings = extension_settings[extensionName];

    // 空值检测：防止 startTag 或 endTag 为空时构建出会导致无限匹配的正则表达式，造成浏览器崩溃
    if (!settings.startTag || !settings.endTag) {
        console.warn('[iframe] startTag or endTag is empty, skipping placeholder processing');
        return;
    }

    const shouldAutoClickBatch = settings.zidongdianji === "true" && window.zidongdianji;
    const escapeRegExp = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };
    const pattern = new RegExp(`${escapeRegExp(settings.startTag)}([\\s\\S]*?)${escapeRegExp(settings.endTag)}`, 'g');
    const doc = rootElement.ownerDocument || rootElement;

    // 1. Build a flat list of relevant nodes (text and <br>) and a logical text representation.
    const nodeInfos = [];
    let logicalText = '';
    const walker = doc.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (node) {
            const parentTag = node.parentElement?.tagName;
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') {
                return NodeFilter.FILTER_SKIP; // Skip non-BR elements but check their children
            }
            if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'BUTTON' || node.parentElement?.classList.contains('image-tag-button') || node.parentElement?.classList.contains('st-chatu8-image-span')) {
                return NodeFilter.FILTER_REJECT; // Reject content of these tags entirely
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    let n;
    while (n = walker.nextNode()) {
        const start = logicalText.length;
        let text = '';
        if (n.nodeType === Node.TEXT_NODE) {
            text = n.textContent;
        } else if (n.tagName === 'BR') {
            text = '\n';
        }
        logicalText += text;
        nodeInfos.push({ node: n, start: start, end: logicalText.length });
    }

    // 2. Find all matches in the logical text.
    const patternMatches = [];
    let match;
    while ((match = pattern.exec(logicalText)) !== null) {
        patternMatches.push({
            fullMatch: match[0],
            content: match[1],
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            isPatternMatch: true  // 标记为 pattern 匹配，需要替换原文本
        });
    }

    // 3. 获取 saved image matches（联动：一次扫描，两种来源）
    const savedMatches = await getSavedImageMatches(logicalText, rootElement);

    // 如果两个都为空，则无需处理
    if (patternMatches.length === 0 && savedMatches.length === 0) return;

    const clickPromises = [];

    // 4. 先处理 saved matches（这些只需要插入按钮，不需要删除原文本）
    // 按 insertPosition 降序排序，从后往前插入避免索引偏移
    const sortedSavedMatches = [...savedMatches].sort((a, b) => b.insertPosition - a.insertPosition);
    for (const savedMatch of sortedSavedMatches) {
        const promise = createButtonAtPosition(
            savedMatch.insertPosition,
            savedMatch.content,
            nodeInfos,
            doc,
            rootElement,
            settings,
            shouldAutoClickBatch,
            imageAlt
        );
        clickPromises.push(promise);
    }

    // 5. Process pattern matches in reverse to avoid DOM manipulation conflicts.
    for (let i = patternMatches.length - 1; i >= 0; i--) {
        const matchInfo = patternMatches[i];

        // Find all nodes involved in this match
        const nodesToProcess = nodeInfos.filter(info =>
            (matchInfo.startIndex < info.end) && (matchInfo.endIndex > info.start)
        );

        if (nodesToProcess.length === 0) continue;

        const firstNodeInfo = nodesToProcess[0];
        const lastNodeInfo = nodesToProcess[nodesToProcess.length - 1];
        const parent = firstNodeInfo.node.parentNode;

        // 4. Use the Range API for robust DOM manipulation.
        const range = doc.createRange();
        try {
            // Set the start of the range. This is generally safe.
            range.setStart(firstNodeInfo.node, matchInfo.startIndex - firstNodeInfo.start);

            // Set the end of the range, handling text nodes and element nodes differently.
            const endNode = lastNodeInfo.node;
            const endOffset = matchInfo.endIndex - lastNodeInfo.start;

            if (endNode.nodeType === Node.TEXT_NODE) {
                // For a text node, the offset is a character count.
                range.setEnd(endNode, endOffset);
            } else {
                // For an element node (like <br>), we can't use a character offset.
                // Instead, we set the boundary of the range to be *after* the element.
                range.setEndAfter(endNode);
            }
        } catch (e) {
            console.error("st-chatu8: Error setting range. Skipping match.", e, matchInfo);
            continue;
        }

        // 5. Delete the matched content.
        range.deleteContents();

        // 6. Create and insert the new elements (button and span).
        const link = matchInfo.content.replaceAll("《", "<").replaceAll("》", ">").replaceAll("\n", "");
        const requestId = generateStableId(link);
        const tagInsertedMarker = `tag-inserted-${requestId}`;

        // 检测1：检查该tag是否已被插入（使用独立的tag插入标记）
        const tagMarkerAttr = `data-${tagInsertedMarker}`;
        if (rootElement.hasAttribute && rootElement.hasAttribute(tagMarkerAttr)) {
            // 检查按钮是否真的存在，如果不存在则清除标记并继续
            const existingBtn = rootElement.querySelector(`button.image-tag-button[data-link="${CSS.escape(link)}"]`);
            if (existingBtn) {
                console.log('[iframe] Tag already inserted with button, skipping:', link.substring(0, 50));
                continue;
            } else {
                // 标记存在但按钮不存在（可能被编辑删除了），清除标记并继续插入
                console.log('[iframe] Tag marker exists but button missing, re-inserting:', link.substring(0, 50));
                rootElement.removeAttribute(tagMarkerAttr);
            }
        }

        // 检测2：检查是否已存在相同 tag 的按钮（按钮生成的独立检测）
        const existingBtn = rootElement.querySelector(`button.image-tag-button[data-link="${CSS.escape(link)}"]`);
        if (existingBtn) {
            console.log('[iframe] Button already exists, skipping:', link.substring(0, 50), 'loading:', existingBtn.hasAttribute('data-loading'));
            // 即使按钮已存在，也标记tag已插入
            if (rootElement.setAttribute) {
                rootElement.setAttribute(tagMarkerAttr, 'true');
            }
            continue;
        }

        // 标记该tag已插入（在创建按钮之前标记，防止并发重复插入）
        if (rootElement.setAttribute) {
            rootElement.setAttribute(tagMarkerAttr, 'true');
        }

        const button = doc.createElement('button');
        button.className = 'image-tag-button st-chatu8-image-button';
        button.textContent = '生成图片';
        button.dataset.link = link;
        button.dataset.requestId = requestId;
        button.dataset.imageTag = link;

        // Copy event listeners for the button
        let pressTimer = null;
        let isLongPress = false;
        const longPressThreshold = 1200;

        const handlePressStart = (e) => {
            if (e.type === 'mousedown' && e.button !== 0) return;
            isLongPress = false;
            pressTimer = setTimeout(() => {
                isLongPress = true;
                pressTimer = null;
                e.preventDefault();
                if (extension_settings[extensionName].longPressToEdit == "true") {
                    showEditDialog(null, button);
                }
            }, longPressThreshold);
        };

        const handlePressEnd = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        };

        button.addEventListener('click', (e) => {
            if (isLongPress) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            triggerGeneration(button);
        });

        button.addEventListener('mousedown', handlePressStart);
        button.addEventListener('mouseup', handlePressEnd);
        button.addEventListener('mouseleave', handlePressEnd);
        button.addEventListener('touchstart', handlePressStart);
        button.addEventListener('touchend', handlePressEnd);
        button.addEventListener('touchcancel', handlePressEnd);

        // Styles are now handled by CSS class .st-chatu8-image-button
        // button.style.cssText = ... removed to allow theming

        const imgSpan = doc.createElement('span');
        imgSpan.className = 'st-chatu8-image-span';
        imgSpan.dataset.requestId = requestId;

        // Insert the new nodes at the now-collapsed range.
        // insertNode inserts at the start of the range. The last one inserted appears first.
        range.insertNode(imgSpan);
        range.insertNode(button);

        // 7. Asynchronously load image if it exists, and collect buttons for auto-clicking.
        const promise = (async () => {
            const [imageUrl, change, , isVideo] = await getItemImg(link);
            if (imageUrl) {
                createAndShowImage(imgSpan, imageUrl, imageAlt, button, change, isVideo);
                if (extension_settings[extensionName].dbclike === "true") {
                    button.style.setProperty('display', 'none', 'important');
                }
            } else {
                if (shouldAutoClickBatch) {
                    console.log("st-chatu8: 自动:", button);
                    return button; // Return the button to be clicked
                }
            }
            return null; // Return null if not to be clicked
        })();

        clickPromises.push(promise);
    }

    // After the loop, resolve promises and trigger auto-clicks in the correct order (top to bottom).
    Promise.all(clickPromises).then(buttonsToClick => {
        const filteredButtons = buttonsToClick.filter(Boolean);
        if (filteredButtons.length > 0) {
            // The buttons were collected from a reverse loop, so they are in bottom-to-top order.
            // Reverse them again to get top-to-bottom order for clicking.
            const orderedButtons = filteredButtons.reverse();
            (async () => {
                for (const button of orderedButtons) {
                    const requestId = button.dataset.requestId;

                    // 创建等待响应的 Promise
                    const waitForResponse = new Promise(resolve => {
                        const responseHandler = (responseData) => {
                            if (responseData.id === requestId) {
                                eventSource.removeListener(EventType.GENERATE_IMAGE_RESPONSE, responseHandler);
                                resolve();
                            }
                        };
                        eventSource.on(EventType.GENERATE_IMAGE_RESPONSE, responseHandler);
                    });

                    // 触发生成
                    triggerGeneration(button);

                    // 等待生成完成
                    await waitForResponse;

                    // 注意：生成完成后的间隔等待已由 releaseLock() 统一处理
                }
            })();
        }
    });

    // 标记元素已处理完成，防止重复处理
    if (rootElement.dataset) {
        rootElement.dataset.chatu8Processed = 'true';
    }
}
