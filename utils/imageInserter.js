// @ts-nocheck
/**
 * imageInserter.js - 图片插入模块
 * 
 * 图片解析和 DOM 插入逻辑
 */

import { setcharData, getcharData } from "./chatDataUtils.js";
import { getContext } from "../../../../st-context.js";
import { saveChatConditional, chat, messageFormatting, eventSource, event_types } from "../../../../../script.js";
import { extension_settings } from "../../../../extensions.js";
import { extensionName } from "./config.js";

/**
 * 基于行匹配的模糊定位
 * 利用换行符作为天然的分隔点，找到最相似的行
 * @param {string} logicalText - 完整的逻辑文本
 * @param {string} targetSnippet - AI 提供的字符串（可能有幻觉）
 * @param {number} minSimilarity - 最低相似度阈值，默认 0.5
 * @returns {{lineIndex: number, endIndex: number, similarity: number, matchedLine: string} | null}
 */
export function fuzzyMatchLine(logicalText, targetSnippet, minSimilarity = 0.5) {
    // 按换行分割成行
    const lines = logicalText.split('\n');

    // 规范化目标字符串（移除首尾空格）
    const normalizedTarget = targetSnippet.trim();
    if (!normalizedTarget) return null;

    let bestMatch = null;
    let bestScore = 0;
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineEnd = currentIndex + line.length;

        // 计算相似度
        const score = calculateLineSimilarity(line, normalizedTarget);

        if (score > bestScore) {
            bestScore = score;
            bestMatch = {
                lineIndex: i,
                endIndex: lineEnd,  // 行末位置（换行符之前）
                similarity: score,
                matchedLine: line
            };
        }

        // 更新索引（+1 是换行符）
        currentIndex = lineEnd + 1;
    }

    // 检查是否达到最低相似度阈值
    if (bestMatch && bestMatch.similarity >= minSimilarity) {
        return bestMatch;
    }

    return null;
}

/**
 * 计算两个字符串的相似度
 * 结合多种策略：包含关系、公共词比例、n-gram 相似度
 * @param {string} line - 原文行
 * @param {string} target - AI 提供的目标字符串
 * @returns {number} 0-1 之间的相似度分数
 */
export function calculateLineSimilarity(line, target) {
    const normLine = line.trim().toLowerCase();
    const normTarget = target.trim().toLowerCase();

    if (!normLine || !normTarget) return 0;

    // 1. 精确包含：如果 target 是 line 的子串
    if (normLine.includes(normTarget)) return 1.0;
    if (normTarget.includes(normLine) && normLine.length > 10) return 0.95;

    // 2. 词汇重叠率（对中文按字符切分，对英文按空格切分）
    const lineChars = new Set(normLine.split('').filter(c => c.trim()));
    const targetChars = normTarget.split('').filter(c => c.trim());

    if (targetChars.length === 0) return 0;

    let matchedChars = 0;
    for (const char of targetChars) {
        if (lineChars.has(char)) {
            matchedChars++;
        }
    }
    const charOverlap = matchedChars / targetChars.length;

    // 3. 字符级别的 n-gram 相似度（用于处理小错误）
    const ngramScore = calculateNgramSimilarity(normLine, normTarget, 3);

    // 综合评分：字符重叠和 n-gram 各占一半
    return charOverlap * 0.5 + ngramScore * 0.5;
}

/**
 * 计算 n-gram 相似度（Jaccard 相似度）
 * @param {string} str1 - 字符串1
 * @param {string} str2 - 字符串2
 * @param {number} n - n-gram 的 n 值
 * @returns {number} 0-1 之间的相似度分数
 */
export function calculateNgramSimilarity(str1, str2, n = 3) {
    const getNgrams = (str) => {
        const ngrams = new Set();
        for (let i = 0; i <= str.length - n; i++) {
            ngrams.add(str.substring(i, i + n));
        }
        return ngrams;
    };

    const ngrams1 = getNgrams(str1);
    const ngrams2 = getNgrams(str2);

    if (ngrams1.size === 0 || ngrams2.size === 0) return 0;

    let intersection = 0;
    for (const ng of ngrams1) {
        if (ngrams2.has(ng)) intersection++;
    }

    // Jaccard 相似度
    const union = ngrams1.size + ngrams2.size - intersection;
    return intersection / union;
}

/**
 * 从 LLM 输出中解析 images
 * 解析流程：
 * 1. 先提取 <images>...</images> 区域（如果存在）
 * 2. 在该区域内用 <image>...</image> 分割出各个图片块
 * 3. 在每个图片块内解析 regex: 和 image###...###
 * @param {string} text - LLM 输出的文本
 * @returns {Array<{regex: string, tag: string}>} 解析出的 images 数组
 */
export function parseImagesFromPrompt(text) {
    const images = [];

    if (!text || typeof text !== 'string') {
        return images;
    }

    console.log('[parseImagesFromPrompt] 开始解析，文本长度:', text.length);

    // 第一步：提取 <images>...</images> 区域（如果存在多个，选择最长的那个）
    let searchText = text;
    const imagesContainerRegex = /<images>([\s\S]*?)<\/images>/g;
    const allImagesMatches = [...text.matchAll(imagesContainerRegex)];

    if (allImagesMatches.length > 0) {
        // 找到内容最长的 <images> 块
        let longestMatch = allImagesMatches[0];
        for (const match of allImagesMatches) {
            if (match[1].length > longestMatch[1].length) {
                longestMatch = match;
            }
        }
        searchText = longestMatch[1];
        console.log('[parseImagesFromPrompt] 找到', allImagesMatches.length, '个 <images> 容器，使用最长的（长度:', searchText.length, '）');
    } else {
        console.log('[parseImagesFromPrompt] 未找到 <images> 容器，使用完整文本');
    }

    // 第二步：在 <images> 区域内匹配所有 <image>...</image> 标签
    const imageRegex = /<image>([\s\S]*?)<\/image>/g;
    const imageBlocks = [];
    let imageMatch;

    while ((imageMatch = imageRegex.exec(searchText)) !== null) {
        imageBlocks.push({
            fullMatch: imageMatch[0],
            content: imageMatch[1],
            startIndex: imageMatch.index
        });
    }

    console.log('[parseImagesFromPrompt] 找到', imageBlocks.length, '个 <image> 块');

    // 第二步：在每个 <image> 块内解析
    for (let i = 0; i < imageBlocks.length; i++) {
        const block = imageBlocks[i];
        const imageContent = block.content;

        console.log(`[parseImagesFromPrompt] 解析第 ${i + 1} 个 <image> 块，内容长度: ${imageContent.length}`);

        // 解析 regex: 后面的文本
        // 优先从 <imgthink> 标签内获取，如果没有则直接从 <image> 内容中获取
        let regexText = '';
        const imgthinkRegex = /<imgthink>([\s\S]*?)<\/imgthink>/;
        const imgthinkMatch = imageContent.match(imgthinkRegex);

        if (imgthinkMatch) {
            const imgthinkContent = imgthinkMatch[1];
            // 匹配 regex: 后面的内容（直到换行或标签结束）
            const regexLineMatch = imgthinkContent.match(/regex:(.*?)(?:\n|$)/);
            if (regexLineMatch) {
                regexText = regexLineMatch[1].trim();
            }
        }

        // 如果 imgthink 中没有找到 regex，则直接从 image 内容中查找
        if (!regexText) {
            const directRegexMatch = imageContent.match(/regex:(.*?)(?:\n|$)/);
            if (directRegexMatch) {
                regexText = directRegexMatch[1].trim();
            }
        }

        // 第三步：在当前 <image> 块内解析 image###...### 标签
        let tag = '';
        const tagRegex = /image###([\s\S]*?)###/;
        const tagMatch = imageContent.match(tagRegex);

        if (tagMatch) {
            tag = tagMatch[1].trim();
            console.log(`[parseImagesFromPrompt] 块 ${i + 1}: 找到 tag，长度 ${tag.length}`);
        } else {
            console.log(`[parseImagesFromPrompt] 块 ${i + 1}: 未找到 image###...### 标签`);
        }

        console.log(`[parseImagesFromPrompt] 块 ${i + 1} 结果: regex="${regexText.substring(0, 30)}...", tag="${tag.substring(0, 50)}..."`);

        // 只有当 regex 和 tag 都有值时才添加到数组
        if (regexText && tag) {
            images.push({
                regex: regexText,
                tag: tag
            });
        }
    }

    console.log('[parseImagesFromPrompt] 解析完成，共', images.length, '个有效图片');

    // 统一修复所有 tag 中的换行问题（AI 生成的 tag 可能带有 \n###）
    for (const image of images) {
        if (image.tag) {
            image.tag = image.tag.replaceAll("\n###", "###");
        }
    }

    return images;
}

/**
 * 将 images 插入到 el 元素的文本节点中
 * 使用 image 里的 regex 定位文本位置，在匹配文本后面插入 image 标签
 * 标签由 iframe.js 的 findAndReplaceInElement 函数统一处理生成按钮
 * @param {HTMLElement} rootElement - 要处理的根元素
 * @param {Array<{regex: string, tag: string}>} images - 解析出的 images 数组
 */
export async function insertImagesIntoElement(rootElement, images) {
    if (!rootElement || !images || images.length === 0) {
        return;
    }

    const doc = rootElement.ownerDocument || document;

    // 0. 删除已存在的 image 相关元素（重 roll 时清理旧的）
    // 删除 image-tag-button 按钮
    const existingButtons = rootElement.querySelectorAll('.image-tag-button, .st-chatu8-image-button');
    existingButtons.forEach(btn => btn.remove());

    // 删除 st-chatu8-image-span 容器
    const existingSpans = rootElement.querySelectorAll('.st-chatu8-image-span');
    existingSpans.forEach(span => span.remove());

    // 删除 st-chatu8-image-container 容器
    const existingContainers = rootElement.querySelectorAll('.st-chatu8-image-container');
    existingContainers.forEach(container => container.remove());

    // 删除 st-chatu8-collapse-wrapper 折叠容器
    const existingCollapseWrappers = rootElement.querySelectorAll('.st-chatu8-collapse-wrapper');
    existingCollapseWrappers.forEach(wrapper => wrapper.remove());

    console.log('[insertImagesIntoElement] Cleaned up existing image elements');

    // 1. 使用 TreeWalker 构建文本节点列表和逻辑文本
    const nodeInfos = [];
    let logicalText = '';
    const walker = doc.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (node) {
            const parentTag = node.parentElement?.tagName;
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') {
                return NodeFilter.FILTER_SKIP;
            }
            if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'BUTTON' ||
                node.parentElement?.classList.contains('image-tag-button') ||
                node.parentElement?.classList.contains('st-chatu8-image-span')) {
                return NodeFilter.FILTER_REJECT;
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

    if (logicalText.length === 0) return;

    // 1.5 对于 image_groups 的情况，获取锁定的旧 tag 并合并到 images 中一起插入
    // 这确保锁定的 tag 在重新生成时不会丢失
    const elKey = generateElKey(logicalText);
    if (elKey) {
        try {
            const imageGroups = await getcharData('image_groups') || {};
            const existingImages = imageGroups[elKey] || [];
            const lockedImages = existingImages.filter(img => img.locked === true);

            if (lockedImages.length > 0) {
                console.log('[insertImagesIntoElement] Found', lockedImages.length, 'locked images in image_groups, merging...');
                // 将锁定的旧 tag 添加到 images 数组的开头（确保它们也被插入）
                // 过滤掉与新 images 中重复的 tag
                const newTags = new Set(images.map(img => img.tag?.trim()));
                const lockedToAdd = lockedImages.filter(img => !newTags.has(img.tag?.trim()));
                images = [...lockedToAdd, ...images];
                console.log('[insertImagesIntoElement] After merging locked images:', images.length, 'total');
            }
        } catch (e) {
            console.warn('[insertImagesIntoElement] Error getting locked images from image_groups:', e);
        }
    }

    // 2. 为每个 image 使用模糊匹配找到最相似的行
    const matches = [];
    for (const image of images) {
        if (!image.regex || !image.tag) continue;

        // 使用模糊行匹配代替精确正则匹配
        const matchResult = fuzzyMatchLine(logicalText, image.regex, 0.5);

        if (matchResult) {
            matches.push({
                endIndex: matchResult.endIndex,
                tag: image.tag,
                matchText: matchResult.matchedLine,  // 使用实际匹配到的行（正确的文本）
                similarity: matchResult.similarity,
                aiRegex: image.regex  // 保留 AI 原始的 regex 用于调试
            });
            console.log(`[insertImagesIntoElement] Fuzzy matched with ${(matchResult.similarity * 100).toFixed(1)}% similarity`);
            console.log(`  AI regex: "${image.regex}"`);
            console.log(`  Matched line: "${matchResult.matchedLine}"`);
        } else {
            console.warn('[insertImagesIntoElement] No fuzzy match found for:', image.regex);
        }
    }

    if (matches.length === 0) {
        console.log('[insertImagesIntoElement] No matches found for any image regex');
        return;
    }

    // 2.5 对 matches 进行去重（基于 regex 或 tag 相同）
    const seenRegex = new Set();
    const seenTags = new Set();
    const uniqueMatches = [];
    for (const match of matches) {
        const regexKey = match.aiRegex?.trim().toLowerCase();
        const tagKey = match.tag?.trim().toLowerCase();
        // 如果 regex 或 tag 已存在，则跳过
        if ((regexKey && seenRegex.has(regexKey)) || (tagKey && seenTags.has(tagKey))) {
            console.log(`[insertImagesIntoElement] Skipping duplicate - regex: "${match.aiRegex}", tag: "${match.tag}"`);
            continue;
        }
        if (regexKey) seenRegex.add(regexKey);
        if (tagKey) seenTags.add(tagKey);
        uniqueMatches.push(match);
    }
    console.log(`[insertImagesIntoElement] After deduplication: ${uniqueMatches.length} unique matches (from ${matches.length})`);

    // 替换 matches 为去重后的数组
    matches.length = 0;
    matches.push(...uniqueMatches);

    // 收集位置信息用于保存（使用匹配行的最后 40 个字符作为 regex，确保在 iframe 的 50 字符窗口内可以匹配）
    const positionedImages = matches.map(m => {
        // 截取匹配行的最后 40 个字符，确保足够短以在 50 字符窗口内找到
        const maxRegexLen = 40;
        const regexToSave = m.matchText.length > maxRegexLen
            ? m.matchText.slice(-maxRegexLen)
            : m.matchText;
        return {
            endIndex: m.endIndex,
            regex: regexToSave,  // 使用截取后的字符串作为 regex
            tag: m.tag
        };
    });

    // 按 endIndex 降序排序，从后往前处理避免索引偏移
    matches.sort((a, b) => b.endIndex - a.endIndex);

    console.log('[insertImagesIntoElement] Found matches:', matches);

    // 3. 处理每个匹配，在匹配文本后面插入 image 标签文本
    for (const matchInfo of matches) {
        // 找到包含 endIndex 的节点
        let targetNodeInfo = null;
        for (const info of nodeInfos) {
            if (matchInfo.endIndex > info.start && matchInfo.endIndex <= info.end) {
                targetNodeInfo = info;
                break;
            }
        }

        // 如果 endIndex 刚好在某个节点的 end 位置，使用该节点
        if (!targetNodeInfo) {
            for (const info of nodeInfos) {
                if (matchInfo.endIndex === info.end) {
                    targetNodeInfo = info;
                    break;
                }
            }
        }

        if (!targetNodeInfo) {
            console.warn('[insertImagesIntoElement] Could not find target node for match:', matchInfo);
            continue;
        }

        // 4. 构建 image 标签文本（格式: image###tag###）
        // 注意：<image> 标签只在确定插入正文时才使用（insertOriginalText 模式）
        // 这里是 DOM 临时显示，不使用 <image> 标签包裹
        const tag = matchInfo.tag;
        const imageTagText = `image###${tag}###`;

        // 检查该标签是否已存在于文本中
        if (logicalText.includes(imageTagText)) {
            console.log('[insertImagesIntoElement] Tag already exists in text:', tag);
            continue;
        }

        // 5. 使用 Range API 在匹配文本后插入标签文本
        const range = doc.createRange();
        try {
            const targetNode = targetNodeInfo.node;
            const offsetInNode = matchInfo.endIndex - targetNodeInfo.start;

            if (targetNode.nodeType === Node.TEXT_NODE) {
                range.setStart(targetNode, offsetInNode);
                range.setEnd(targetNode, offsetInNode);
            } else {
                // 对于 BR 等元素节点，在其后插入
                range.setStartAfter(targetNode);
                range.setEndAfter(targetNode);
            }
        } catch (e) {
            console.error('[insertImagesIntoElement] Error setting range:', e, matchInfo);
            continue;
        }

        // 6. 创建文本节点并插入
        const textNode = doc.createTextNode(imageTagText);
        range.insertNode(textNode);

        console.log('[insertImagesIntoElement] Inserted image tag for:', tag);
    }

    // 保存位置信息（传入 rootElement 用于判断保存位置，传入 logicalText 用于检查重 roll 覆盖）
    await saveImageGroup(positionedImages, logicalText, rootElement);
    console.log('[insertImagesIntoElement] Saved image group with', positionedImages.length, 'images');
}

/**
 * 生成 el 的主键：取文本中间 20 个字符
 * @param {string} text - 逻辑文本
 * @returns {string} 主键
 */
export function generateElKey(text) {
    if (!text || text.length === 0) return '';
    const len = text.length;
    const keyLen = 20;
    const start = Math.max(0, Math.floor(len / 2) - Math.floor(keyLen / 2));
    return text.substring(start, start + keyLen);
}

/**
 * 获取去除 placeholder.js 生成元素后的纯文本
 * 用于生成 elKey 时确保与保存时一致
 * @param {HTMLElement} el - 目标元素
 * @returns {string} 干净的逻辑文本
 */
export function getCleanLogicalText(el) {
    if (!el) return '';

    // 克隆元素以避免修改原始 DOM
    const clone = el.cloneNode(true);

    // 需要去除的 placeholder.js 生成的元素选择器
    const selectorsToRemove = [
        '.st-chatu8-image-button',
        '.image-tag-button',
        '.st-chatu8-image-span',
        '.st-chatu8-image-container',
        '.st-chatu8-collapse-wrapper'
    ];

    // 删除这些元素
    for (const selector of selectorsToRemove) {
        const elements = clone.querySelectorAll(selector);
        elements.forEach(elem => elem.remove());
    }

    return clone.textContent || '';
}

/**
 * 在所有 image_groups 中按 tag 内容搜索
 * 用于当通过 elKey 无法定位时的备选方案
 * @param {string} tagToFind - 要查找的 tag 内容
 * @returns {Promise<{elKey: string, images: Array, index: number}|null>} 找到的条目信息，包含 elKey、images 数组和 tag 在数组中的索引
 */
export async function findTagInImageGroups(tagToFind) {
    if (!tagToFind) return null;

    const imageGroups = await getcharData('image_groups') || {};

    for (const [elKey, images] of Object.entries(imageGroups)) {
        if (!Array.isArray(images)) continue;

        for (let i = 0; i < images.length; i++) {
            if (images[i].tag === tagToFind) {
                return { elKey, images, index: i };
            }
        }
    }

    return null;
}

/**
 * 保存一组 images 的位置信息
 * 根据 el 类型选择保存位置：
 * - mes_text 元素：保存到 getContext().chat[id].extra.images
 * - 非 mes_text 元素：保存到 chatMetadata['st-chatu8']['data']['image_groups']
 * @param {Array<{endIndex: number, regex: string, tag: string}>} images
 * @param {string} logicalText - 逻辑文本，用于生成主键（非 mes_text 元素使用）
 * @param {HTMLElement} el - DOM 元素，用于判断保存位置
 */
/**
 * 从元素定位 mes_text
 * 支持三种情况：直接 mes_text、iframe 内元素、普通元素
 * @param {HTMLElement} el - 需要定位的元素
 * @returns {HTMLElement|null} - mes_text 元素或 null
 */
function findMesTextFromElement(el) {
    // 情况 1: el 本身就是 mes_text
    if (el && el.classList && el.classList.contains('mes_text')) {
        return el;
    }

    // 情况 2: el 在 iframe 内，需要查找外部的 mes_text
    const elDoc = el?.ownerDocument;
    if (elDoc && elDoc !== document) {
        // 在父页面找到对应的 iframe
        for (const iframe of document.querySelectorAll('iframe')) {
            if (iframe.contentDocument === elDoc) {
                return iframe.closest('.mes_text');
            }
        }
    }

    // 情况 3: 普通元素，直接向上查找
    return el?.closest?.('.mes_text');
}

/**
 * 在字符串指定位置插入内容
 * @param {string} str - 原字符串
 * @param {number} index - 插入位置
 * @param {string} insertion - 要插入的内容
 * @returns {string} - 插入后的字符串
 */
function insertAt(str, index, insertion) {
    return str.slice(0, index) + insertion + str.slice(index);
}

/**
 * 重新渲染消息（复用自 newline_fix.js 的逻辑）
 * @param {number} messageId - 消息 ID
 */
async function renderMessage(messageId) {
    console.log('[imageInserter] Rendering message:', messageId);
    const mesHtml = document.querySelector(`div.mes[mesid="${messageId}"]`);
    if (!mesHtml) {
        return;
    }

    const chatMessage = chat[messageId];
    if (!chatMessage) {
        return;
    }

    if (chatMessage.swipes) {
        const swipesCounter = mesHtml.querySelector('.swipes-counter');
        if (swipesCounter) {
            swipesCounter.textContent = `${chatMessage.swipe_id + 1}\u200b/\u200b${chatMessage.swipes.length}`;
        }
    }

    const mesText = mesHtml.querySelector('.mes_text');
    if (mesText) {
        mesText.innerHTML = messageFormatting(
            chatMessage.mes,
            chatMessage.name,
            chatMessage.is_system,
            chatMessage.is_user,
            messageId,
        );
    }

    await eventSource.emit(
        chatMessage.is_user ? event_types.USER_MESSAGE_RENDERED : event_types.CHARACTER_MESSAGE_RENDERED,
        messageId,
    );
}

export async function saveImageGroup(images, logicalText, el) {
    if (!images || images.length === 0) return;

    // ========== 详细调试信息 ==========
    console.group('[imageInserter] saveImageGroup - el 详细信息');
    console.log('el 对象:', el);
    console.log('el.tagName:', el?.tagName);
    console.log('el.className:', el?.className);
    console.log('el.id:', el?.id);
    console.log('el 是否在 document 中:', el?.isConnected);
    console.log('el.ownerDocument:', el?.ownerDocument === document ? '主文档' : 'iframe 文档');

    // 获取父元素链
    const parentChain = [];
    let parent = el?.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
        parentChain.push(`${parent.tagName}${parent.id ? '#' + parent.id : ''}${parent.className ? '.' + parent.className.split(' ')[0] : ''}`);
        parent = parent.parentElement;
    }
    console.log('父元素链:', parentChain.join(' → '));

    // 文本特征
    const textLen = el?.textContent?.length || 0;
    const midPos = Math.floor(textLen / 2);
    const startPos = Math.max(0, midPos - 10);
    const textSignature = el?.textContent?.substring(startPos, startPos + 20) || '';
    console.log('textContent 长度:', textLen);
    console.log('textContent 中间 20 字特征:', JSON.stringify(textSignature));

    // iframe 相关信息
    if (el?.ownerDocument !== document) {
        const iframeDoc = el?.ownerDocument;
        console.log('iframe document.URL:', iframeDoc?.URL);
        console.log('iframe body 子 div 数量:', iframeDoc?.body?.querySelectorAll(':scope > div').length);
    }

    // 检查 mes_text 相关
    console.log('是 mes_text:', el?.classList?.contains('mes_text'));
    console.log('data-mesid:', el?.getAttribute?.('data-mesid'));
    console.groupEnd();

    // ========== insertOriginalText 模式 ==========
    if (String(extension_settings[extensionName]?.insertOriginalText) === 'true') {
        const mesText = findMesTextFromElement(el);
        if (mesText) {
            const mesBlock = mesText.closest('.mes');
            const mesId = parseInt(mesBlock?.getAttribute('mesid'), 10);

            if (!isNaN(mesId) && chat[mesId]) {
                let mes = chat[mesId].mes;

                // 如果 mes 长度小于 100，退回到原有存储逻辑
                if (mes && mes.length >= 100) {
                    console.log('[imageInserter] insertOriginalText mode - mesId:', mesId, 'mes.length:', mes.length);

                    // 获取锁定的 tag 列表
                    const lockedTags = new Set(chat[mesId].extra?.lockedTags || []);
                    console.log('[imageInserter] Locked tags:', Array.from(lockedTags));

                    // 步骤 1: 清理旧标签，但保留锁定的标签
                    if (lockedTags.size === 0) {
                        // 没有锁定的标签，全部清理
                        mes = mes.replace(/<image>image###[\s\S]*?###<\/image>/g, '');
                        mes = mes.replace(/image###[\s\S]*?###/g, '');
                    } else {
                        // 有锁定的标签，精确清理
                        mes = mes.replace(/<image>image###([\s\S]*?)###<\/image>/g, (match, tag) => {
                            if (lockedTags.has(tag.trim())) {
                                return match; // 保留锁定的
                            }
                            return ''; // 删除未锁定的
                        });
                        mes = mes.replace(/image###([\s\S]*?)###/g, (match, tag) => {
                            if (lockedTags.has(tag.trim())) {
                                return match; // 保留锁定的
                            }
                            return ''; // 删除未锁定的
                        });
                    }

                    // 步骤 1.5: 修复换行问题（同 newline_fix.js 的逻辑）
                    mes = mes.replaceAll("\n###", "###");
                    // 清理连续多个换行（3个以上换行变成2个）
                    mes = mes.replace(/\n{3,}/g, '\n\n');

                    // 步骤 2: 使用 regex 找到位置并插入新标签（跳过与锁定 tag 相同的）
                    for (const img of images) {
                        // 如果新 tag 与锁定的 tag 相同，跳过（避免重复插入）
                        if (lockedTags.has(img.tag.trim())) {
                            console.log('[imageInserter] Skipping locked tag:', img.tag.substring(0, 30));
                            continue;
                        }
                        const matchResult = fuzzyMatchLine(mes, img.regex, 0.5);
                        if (matchResult) {
                            // 在匹配行末尾插入 <image>image###tag###</image>，添加两个换行符确保标签前有空行
                            const insertTag = `\n\n<image>image###${img.tag}###</image>`;
                            mes = insertAt(mes, matchResult.endIndex, insertTag);
                            console.log('[imageInserter] Inserted tag at position', matchResult.endIndex, 'for regex:', img.regex.substring(0, 30));
                        } else {
                            console.warn('[imageInserter] No match found for regex:', img.regex.substring(0, 50));
                        }
                    }

                    // 步骤 3: 保存并重新渲染
                    chat[mesId].mes = mes;
                    await saveChatConditional();
                    await renderMessage(mesId);

                    console.log('[imageInserter] Saved to chat[' + mesId + '].mes (insertOriginalText mode)');
                    return; // 不执行原有保存逻辑
                } else {
                    console.log('[imageInserter] mes.length < 100, falling back to original storage');
                }
            }
        }
    }

    // ========== 原有保存逻辑 ==========
    // 判断是否是 mes_text 元素
    if (el && el.classList && el.classList.contains('mes_text')) {
        // ===== mes_text 元素：保存到 chat[id].extra.images =====
        // 获取消息 ID
        const grandParent = el.parentElement?.parentElement;
        const idStr = grandParent?.getAttribute('mesid');

        if (!idStr) {
            console.warn('[imageInserter] mes_text element but mesid not found, falling back to chatMetadata');
            await saveToMetadata(images, logicalText);
            return;
        }

        const id = parseInt(idStr, 10);
        const context = getContext();

        if (!context.chat || !context.chat[id]) {
            console.warn('[imageInserter] chat message not found for id:', id, ', falling back to chatMetadata');
            await saveToMetadata(images, logicalText);
            return;
        }

        // 确保 extra 对象存在
        if (!context.chat[id].extra) {
            context.chat[id].extra = {};
        }

        // 确保 extra.images 对象存在
        if (!context.chat[id].extra.images) {
            context.chat[id].extra.images = {};
        }

        // 获取 swipe_id 作为 key，如果不存在则默认为 0
        const key = context.chat[id].swipe_id ?? 0;

        // 获取旧数据中锁定的条目
        const oldImages = context.chat[id].extra.images[key] || [];
        const lockedImages = oldImages.filter(img => img.locked === true);

        // 过滤新 images，移除与锁定 tag 重复的条目
        const lockedTags = new Set(lockedImages.map(img => img.tag));
        const newImagesFiltered = images.filter(img => !lockedTags.has(img.tag));

        // 合并锁定的旧条目和新条目
        const mergedImages = [...lockedImages, ...newImagesFiltered];

        // 保存到 extra.images[key]（按 swipe_id 覆盖）
        const isOverride = !!context.chat[id].extra.images[key];
        context.chat[id].extra.images[key] = mergedImages;

        // 保存聊天记录
        saveChatConditional();

        console.log('[imageInserter] Saved to chat[' + id + '].extra.images[' + key + ']:', mergedImages,
            isOverride ? '(overridden)' : '(new)',
            lockedImages.length > 0 ? `(preserved ${lockedImages.length} locked)` : '');

        // 如果 mes 长度 > 100 且有锁定的 tag，触发 renderMessage 刷新页面
        // 这确保 mes 中的锁定 tag 能正确显示
        if (context.chat[id].mes && context.chat[id].mes.length > 100 && lockedImages.length > 0) {
            console.log('[imageInserter] Forcing re-render to display locked tags in mes');
            await renderMessage(id);
        }
    } else {
        // ===== 非 mes_text 元素：保存到 chatMetadata =====
        await saveToMetadata(images, logicalText);
    }
}

/**
 * 内部函数：保存到 chatMetadata（原有逻辑）
 * @param {Array<{endIndex: number, regex: string, tag: string}>} images
 * @param {string} logicalText - 逻辑文本，用于生成主键
 */
async function saveToMetadata(images, logicalText) {
    // 获取现有数据
    const imageGroups = await getcharData('image_groups') || {};

    // 使用中间 20 字符作为主键（O(1) 查找和覆盖）
    const elKey = generateElKey(logicalText);

    if (!elKey) {
        console.warn('[imageInserter] Cannot generate elKey, logicalText too short');
        return;
    }

    // 获取旧数据中锁定的条目
    const oldImages = imageGroups[elKey] || [];
    const lockedImages = oldImages.filter(img => img.locked === true);

    // 过滤新 images，移除与锁定 tag 重复的条目
    const lockedTags = new Set(lockedImages.map(img => img.tag));
    const newImagesFiltered = images.filter(img => !lockedTags.has(img.tag));

    // 合并锁定的旧条目和新条目
    const mergedImages = [...lockedImages, ...newImagesFiltered];

    const isOverride = !!imageGroups[elKey];

    // 保存合并后的数据
    imageGroups[elKey] = mergedImages;

    await setcharData('image_groups', imageGroups);

    console.log('[imageInserter] Saved to chatMetadata:', elKey, mergedImages,
        isOverride ? '(overridden)' : '(new)',
        lockedImages.length > 0 ? `(preserved ${lockedImages.length} locked)` : '');
}

/**
 * 生成稳定的 ID
 * @param {string} str - 输入字符串
 * @returns {string} 稳定的 ID
 */
export function generateStableId(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return 'chatu8-id-' + Math.abs(hash).toString(36);
}

/**
 * 删除 el 元素关联的图片数据和 DOM 元素
 * @param {HTMLElement} el - 目标元素
 */
export async function deleteImagesForElement(el) {
    if (!el) {
        console.warn('[imageInserter] deleteImagesForElement: el is null');
        return;
    }

    console.log('[imageInserter] deleteImagesForElement called for:', el.tagName, el.className);

    // 判断是否在 iframe 内
    const isInIframe = el.ownerDocument !== document;

    // 找到 mes_text 元素（用于后续存储删除）
    const mesText = findMesTextFromElement(el);

    // 1. 删除 DOM 元素 - 根据上下文选择正确的搜索范围
    let searchRoot = el;

    if (mesText && !isInIframe) {
        // 如果是 mes_text 或其内部元素，在 mes_text 范围内搜索
        searchRoot = mesText;
    }

    // 只删除图片相关的元素，不影响其他结构
    const imageSelectors = [
        '.image-tag-button',
        '.st-chatu8-image-button',
        '.st-chatu8-image-span',
        '.st-chatu8-image-container',
        '.st-chatu8-collapse-wrapper'
    ];

    let removedCount = 0;
    let lockedCount = 0;

    // 0. 先获取锁定的 tag 列表（需要在删除 DOM 之前获取）
    let lockedTagSet = new Set();
    if (mesText) {
        const mesBlock = mesText.closest('.mes');
        const id = parseInt(mesBlock?.getAttribute('mesid'), 10);
        const context = getContext();

        if (!isNaN(id) && context.chat[id]) {
            // 方式 1: 从 extra.images 获取锁定的 tag
            if (context.chat[id].extra?.images) {
                const key = context.chat[id].swipe_id ?? 0;
                const existingImages = context.chat[id].extra.images[key] || [];
                existingImages.filter(img => img.locked === true).forEach(img => {
                    lockedTagSet.add(img.tag);
                });
            }

            // 方式 2: 从 extra.lockedTags 获取锁定的 tag (insertOriginalText 模式)
            const lockedTagsArray = context.chat[id].extra?.lockedTags || [];
            lockedTagsArray.forEach(tag => lockedTagSet.add(tag));

            // 方式 3: 解析 mes 正文中的 tag，检查它们是否在锁定列表中
            // 无论当前是否使用 insertOriginalText 模式，都要检查正文中的 tag
            // 因为 mes 中可能有之前插入的锁定 tag
            if (context.chat[id].mes) {
                const mesTagRegex = /image###([\s\S]*?)###/g;
                let match;
                while ((match = mesTagRegex.exec(context.chat[id].mes)) !== null) {
                    const tagInMes = match[1].trim();
                    // 如果这个 tag 在 lockedTags 列表中，确保它被添加到 lockedTagSet
                    if (lockedTagsArray.includes(tagInMes)) {
                        lockedTagSet.add(tagInMes);
                        console.log('[imageInserter] Found locked tag in mes:', tagInMes.substring(0, 30));
                    }
                }
            }

            console.log('[imageInserter] Total locked tags:', lockedTagSet.size,
                'from extra.lockedTags:', lockedTagsArray.length);
        }
    }
    lockedCount = lockedTagSet.size;
    console.log('[imageInserter] Locked tags for deletion check:', Array.from(lockedTagSet));

    // 辅助函数：检查元素是否对应锁定的 tag
    const isElementLocked = (elem) => {
        // 辅助函数：检查 tag 是否匹配锁定列表
        const isTagLocked = (tag) => {
            if (!tag) return false;
            const tagTrimmed = tag.trim();
            if (lockedTagSet.has(tagTrimmed)) return true;
            for (const lockedTag of lockedTagSet) {
                if (lockedTag.trim() === tagTrimmed ||
                    tagTrimmed.includes(lockedTag.trim()) ||
                    lockedTag.trim().includes(tagTrimmed)) {
                    return true;
                }
            }
            return false;
        };

        // 1. 检查元素自身的 data-link 属性
        const link = elem.dataset?.link || elem.getAttribute?.('data-link');
        if (isTagLocked(link)) {
            console.log('[imageInserter] Element locked (self):', link?.substring(0, 30));
            return true;
        }

        // 2. 检查父级按钮的 data-link
        const parentButton = elem.closest?.('.st-chatu8-image-button, .image-tag-button');
        if (parentButton && parentButton !== elem) {
            const parentLink = parentButton.dataset?.link || parentButton.getAttribute?.('data-link');
            if (isTagLocked(parentLink)) {
                console.log('[imageInserter] Element locked via parent:', parentLink?.substring(0, 30));
                return true;
            }
        }

        // 3. 检查兄弟按钮 (针对 st-chatu8-image-span 等元素)
        const parent = elem.parentElement;
        if (parent) {
            const siblingButtons = parent.querySelectorAll('.st-chatu8-image-button, .image-tag-button');
            for (const sibBtn of siblingButtons) {
                const sibLink = sibBtn.dataset?.link || sibBtn.getAttribute?.('data-link');
                if (isTagLocked(sibLink)) {
                    console.log('[imageInserter] Element locked via sibling:', sibLink?.substring(0, 30));
                    return true;
                }
            }
        }

        // 4. 检查前一个兄弟元素是否是锁定的按钮
        const prevSibling = elem.previousElementSibling;
        if (prevSibling?.classList?.contains('st-chatu8-image-button') ||
            prevSibling?.classList?.contains('image-tag-button')) {
            const prevLink = prevSibling.dataset?.link || prevSibling.getAttribute?.('data-link');
            if (isTagLocked(prevLink)) {
                console.log('[imageInserter] Element locked via prev sibling:', prevLink?.substring(0, 30));
                return true;
            }
        }

        return false;
    };

    // 0.5 收集 el 范围内要删除的 tag 列表（在删除 DOM 之前）
    const deletedTags = new Set();
    const collectTagsFromElement = (elem) => {
        const link = elem.dataset?.link || elem.getAttribute?.('data-link');
        if (link && !isElementLocked(elem)) {
            deletedTags.add(link.trim());
        }
    };

    // 先收集所有要删除的 tag
    try {
        const allButtons = searchRoot.querySelectorAll('.st-chatu8-image-button, .image-tag-button');
        allButtons.forEach(btn => collectTagsFromElement(btn));
        console.log('[imageInserter] Tags to delete from storage:', Array.from(deletedTags));
    } catch (e) {
        console.warn('[imageInserter] Error collecting tags:', e);
    }

    // 0.6 在删除 DOM 之前生成 elKey（因为删除后 textContent 会改变）
    // 重要：使用 el 本身（而非 mesText）生成 elKey，因为 saveImageGroup 也是用 el 来生成 key 的
    const elKeyForImageGroups = generateElKey(getCleanLogicalText(el));
    console.log('[imageInserter] Pre-computed elKey for image_groups:', elKeyForImageGroups);

    // 1. 删除 DOM 元素（跳过锁定的）
    // 特殊处理折叠容器：如果容器内有任何锁定的按钮，保留整个容器
    try {
        const collapseWrappers = searchRoot.querySelectorAll('.st-chatu8-collapse-wrapper');
        collapseWrappers.forEach(wrapper => {
            // 检查是否有任何一个按钮被锁定
            const buttons = wrapper.querySelectorAll('.st-chatu8-image-button, .image-tag-button');
            const hasAnyLocked = Array.from(buttons).some(btn => isElementLocked(btn));

            if (hasAnyLocked) {
                // 有锁定的按钮，保留整个容器但删除容器内未锁定的按钮
                console.log('[imageInserter] Collapse wrapper has locked buttons, keeping wrapper');
                buttons.forEach(btn => {
                    if (!isElementLocked(btn)) {
                        btn.remove();
                        removedCount++;
                        console.log('[imageInserter] Removed unlocked button inside wrapper');
                    }
                });
            } else if (buttons.length === 0) {
                // 没有按钮，删除空容器
                wrapper.remove();
                removedCount++;
                console.log('[imageInserter] Removed empty collapse wrapper');
            } else {
                // 没有锁定的按钮，删除整个容器
                wrapper.remove();
                removedCount++;
                console.log('[imageInserter] Removed collapse wrapper (no locked buttons)');
            }
        });
    } catch (e) {
        console.warn('[imageInserter] Error removing collapse wrappers:', e);
    }

    for (const selector of imageSelectors) {
        // 跳过已经处理过的 collapse-wrapper
        if (selector === '.st-chatu8-collapse-wrapper') {
            continue;
        }
        try {
            const elements = searchRoot.querySelectorAll(selector);
            elements.forEach(elem => {
                // 检查元素自身是否锁定
                if (isElementLocked(elem)) {
                    console.log('[imageInserter] Skipped locked element:', selector);
                    return; // 跳过锁定的元素
                }

                // 检查元素内部是否有锁定的按钮（针对容器类元素）
                const innerButtons = elem.querySelectorAll?.('.st-chatu8-image-button, .image-tag-button');
                if (innerButtons && innerButtons.length > 0) {
                    const hasLockedInside = Array.from(innerButtons).some(btn => isElementLocked(btn));
                    if (hasLockedInside) {
                        console.log('[imageInserter] Skipped container with locked buttons inside:', selector);
                        return; // 跳过包含锁定按钮的容器
                    }
                }

                elem.remove();
                removedCount++;
            });
        } catch (e) {
            console.warn('[imageInserter] Error removing elements with selector:', selector, e);
        }
    }

    console.log('[imageInserter] Removed', removedCount, 'image-related DOM elements, skipped', lockedCount, 'locked');

    // 2. 根据 el 类型删除存储数据（lockedCount 已在前面计算）

    if (mesText) {
        // mes_text 或其内部元素: 删除 chat[id].extra.images[key]
        const mesBlock = mesText.closest('.mes');
        const id = parseInt(mesBlock?.getAttribute('mesid'), 10);
        const context = getContext();

        if (!isNaN(id) && context.chat[id]) {
            // 删除 extra.images 中的数据（保留锁定的）
            if (context.chat[id].extra?.images) {
                const key = context.chat[id].swipe_id ?? 0;
                const existingImages = context.chat[id].extra.images[key] || [];
                const lockedImages = existingImages.filter(img => img.locked === true);
                lockedCount = lockedImages.length;

                if (lockedImages.length > 0) {
                    // 有锁定的图片，只保留锁定的
                    context.chat[id].extra.images[key] = lockedImages;
                    console.log('[imageInserter] Preserved', lockedCount, 'locked images, deleted others');
                } else {
                    // 没有锁定的图片，全部删除
                    delete context.chat[id].extra.images[key];
                    console.log('[imageInserter] Deleted chat[' + id + '].extra.images[' + key + ']');
                }
            }

            // ★ 在 mes 清理和 renderMessage 之前删除 image_groups
            // 这确保了 renderMessage 触发 placeholder.js 重新处理时，image_groups 数据已经被删除
            console.log('[imageInserter] Deleting from image_groups BEFORE renderMessage...');
            const elKey = elKeyForImageGroups;

            if (elKey && deletedTags.size > 0) {
                const imageGroups = await getcharData('image_groups') || {};
                if (imageGroups[elKey]) {
                    const existingImages = imageGroups[elKey] || [];

                    // 精确过滤：保留锁定的 + 不在 deletedTags 中的
                    const remainingImages = existingImages.filter(img => {
                        if (img.locked === true) return true;
                        if (!deletedTags.has(img.tag?.trim())) return true;
                        console.log('[imageInserter] Deleting tag from image_groups:', img.tag?.substring(0, 30));
                        return false;
                    });

                    const deletedCount = existingImages.length - remainingImages.length;

                    if (deletedCount > 0) {
                        if (remainingImages.length > 0) {
                            imageGroups[elKey] = remainingImages;
                            await setcharData('image_groups', imageGroups);
                            console.log('[imageInserter] image_groups: deleted', deletedCount, ', remaining', remainingImages.length);
                        } else {
                            delete imageGroups[elKey];
                            await setcharData('image_groups', imageGroups);
                            console.log('[imageInserter] image_groups: deleted all, removed key:', elKey);
                        }
                    } else {
                        console.log('[imageInserter] image_groups: no matching tags to delete');
                    }
                } else {
                    console.log('[imageInserter] image_groups: no data found for key:', elKey);
                }
            }

            // 清理 mes 中的 <image>image###...###</image> 和 image###...### 标签
            // 只删除未锁定的标签，保留锁定的标签
            // 注意：使用前面已经构建好的 lockedTagSet（包含 extra.images 和 extra.lockedTags 两个来源）
            if (context.chat[id].mes && lockedTagSet.size === 0) {
                // 没有锁定的图片，可以全部删除
                const oldLen = context.chat[id].mes.length;
                context.chat[id].mes = context.chat[id].mes.replace(/<image>image###[\s\S]*?###<\/image>/g, '');
                context.chat[id].mes = context.chat[id].mes.replace(/image###[\s\S]*?###/g, '');
                // 清理多余换行
                context.chat[id].mes = context.chat[id].mes.replace(/\n{3,}/g, '\n\n');
                const newLen = context.chat[id].mes.length;
                console.log('[imageInserter] Cleaned mes content, removed', oldLen - newLen, 'chars');
                // 只有实际删除了内容才重新渲染，避免不必要的渲染导致 iframe 崩溃
                if (oldLen !== newLen) {
                    await renderMessage(id);
                }
            } else if (context.chat[id].mes && lockedTagSet.size > 0) {
                // 有锁定的图片，需要精确删除未锁定的标签
                let mes = context.chat[id].mes;
                const oldLen = mes.length;

                // 匹配所有 <image>image###...###</image> 标签
                mes = mes.replace(/<image>image###([\s\S]*?)###<\/image>/g, (match, tag) => {
                    if (lockedTagSet.has(tag.trim())) {
                        return match; // 保留锁定的
                    }
                    return ''; // 删除未锁定的
                });

                // 匹配所有独立的 image###...### 标签
                mes = mes.replace(/image###([\s\S]*?)###/g, (match, tag) => {
                    if (lockedTagSet.has(tag.trim())) {
                        return match; // 保留锁定的
                    }
                    return ''; // 删除未锁定的
                });

                // 清理多余换行
                mes = mes.replace(/\n{3,}/g, '\n\n');
                context.chat[id].mes = mes;

                const newLen = mes.length;
                console.log('[imageInserter] Cleaned mes content (preserved locked), removed', oldLen - newLen, 'chars');

                // 如果 mes 长度 > 100 且有锁定的 tag，强制重新渲染以恢复被删除的 DOM
                if (mes.length > 100 && lockedTagSet.size > 0) {
                    console.log('[imageInserter] Forcing re-render to restore locked elements');
                    await renderMessage(id);
                } else if (oldLen !== newLen) {
                    await renderMessage(id);
                }
            }

            await saveChatConditional();
            console.log('[imageInserter] Saved chat after deletion');
        }
    }

    // 对于非 mesText 场景，需在此处执行 image_groups 删除逻辑
    if (!mesText && elKeyForImageGroups && deletedTags.size > 0) {
        console.log('[imageInserter] Non-mesText scenario: deleting from image_groups...');
        const imageGroups = await getcharData('image_groups') || {};
        if (imageGroups[elKeyForImageGroups]) {
            const existingImages = imageGroups[elKeyForImageGroups] || [];

            const remainingImages = existingImages.filter(img => {
                if (img.locked === true) return true;
                if (!deletedTags.has(img.tag?.trim())) return true;
                console.log('[imageInserter] Deleting tag from image_groups:', img.tag?.substring(0, 30));
                return false;
            });

            const deletedCount = existingImages.length - remainingImages.length;

            if (deletedCount > 0) {
                if (remainingImages.length > 0) {
                    imageGroups[elKeyForImageGroups] = remainingImages;
                    await setcharData('image_groups', imageGroups);
                    console.log('[imageInserter] image_groups: deleted', deletedCount, ', remaining', remainingImages.length);
                } else {
                    delete imageGroups[elKeyForImageGroups];
                    await setcharData('image_groups', imageGroups);
                    console.log('[imageInserter] image_groups: deleted all, removed key:', elKeyForImageGroups);
                }
            }
        }
    }

    console.log('[imageInserter] deleteImagesForElement completed, locked count:', lockedCount);
    return { lockedCount };
}

/**
 * 锁定指定 tag
 * @param {HTMLElement} el - 元素（用于定位存储位置）
 * @param {string} tagToLock - 要锁定的 tag 内容
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function lockTagForElement(el, tagToLock) {
    if (!el || !tagToLock) {
        return { success: false, message: '参数无效' };
    }

    const mesText = findMesTextFromElement(el);

    if (mesText) {
        const mesBlock = mesText.closest('.mes');
        const id = parseInt(mesBlock?.getAttribute('mesid'), 10);
        const context = getContext();

        if (!isNaN(id) && context.chat[id]) {
            // 确保 extra 存在
            if (!context.chat[id].extra) {
                context.chat[id].extra = {};
            }

            // 方式1: 尝试在 extra.images 中锁定
            if (context.chat[id].extra.images) {
                const key = context.chat[id].swipe_id ?? 0;
                const images = context.chat[id].extra.images[key] || [];

                let found = false;
                for (const img of images) {
                    if (img.tag === tagToLock) {
                        img.locked = true;
                        found = true;
                    }
                }

                if (found) {
                    await saveChatConditional();
                    console.log('[imageInserter] Locked tag in extra.images:', tagToLock);
                    return { success: true, message: 'Tag 已锁定' };
                }
            }

            // 方式2: insertOriginalText 模式 - 使用 extra.lockedTags
            // 检查 mes 中是否存在该 tag
            const mes = context.chat[id].mes || '';
            if (mes.includes(`image###${tagToLock}###`) || mes.includes(tagToLock)) {
                // 初始化 lockedTags 数组
                if (!context.chat[id].extra.lockedTags) {
                    context.chat[id].extra.lockedTags = [];
                }

                // 添加到锁定列表（避免重复）
                if (!context.chat[id].extra.lockedTags.includes(tagToLock)) {
                    context.chat[id].extra.lockedTags.push(tagToLock);
                }

                await saveChatConditional();
                console.log('[imageInserter] Locked tag in extra.lockedTags:', tagToLock);
                return { success: true, message: 'Tag 已锁定' };
            }

            // 方式3: 备选 - 在 image_groups 中按 tag 全局搜索
            const searchResult = await findTagInImageGroups(tagToLock);
            if (searchResult) {
                const imageGroups = await getcharData('image_groups') || {};
                const images = imageGroups[searchResult.elKey];
                if (images && images[searchResult.index]) {
                    images[searchResult.index].locked = true;
                    await setcharData('image_groups', imageGroups);
                    console.log('[imageInserter] Locked tag in image_groups (fallback from mesText):', tagToLock);
                    return { success: true, message: 'Tag 已锁定' };
                }
            }

            return { success: false, message: '未找到匹配的 tag' };
        }
    } else {
        // chatMetadata - 优先使用 elKey 定位，失败则按 tag 全局搜索
        const logicalText = getCleanLogicalText(el);
        const elKey = generateElKey(logicalText);

        if (elKey) {
            const imageGroups = await getcharData('image_groups') || {};
            const images = imageGroups[elKey] || [];

            let found = false;
            for (const img of images) {
                if (img.tag === tagToLock) {
                    img.locked = true;
                    found = true;
                }
            }

            if (found) {
                imageGroups[elKey] = images;
                await setcharData('image_groups', imageGroups);
                console.log('[imageInserter] Locked tag in metadata:', tagToLock);
                return { success: true, message: 'Tag 已锁定' };
            }
        }

        // 备选方案：按 tag 内容全局搜索 image_groups
        const searchResult = await findTagInImageGroups(tagToLock);
        if (searchResult) {
            const imageGroups = await getcharData('image_groups') || {};
            const images = imageGroups[searchResult.elKey];
            if (images && images[searchResult.index]) {
                images[searchResult.index].locked = true;
                await setcharData('image_groups', imageGroups);
                console.log('[imageInserter] Locked tag in metadata (global search):', tagToLock);
                return { success: true, message: 'Tag 已锁定' };
            }
        }
    }

    return { success: false, message: '未找到匹配的 tag' };
}

/**
 * 解锁指定 tag
 * @param {HTMLElement} el - 元素（用于定位存储位置）
 * @param {string} tagToUnlock - 要解锁的 tag 内容
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function unlockTagForElement(el, tagToUnlock) {
    if (!el || !tagToUnlock) {
        return { success: false, message: '参数无效' };
    }

    const mesText = findMesTextFromElement(el);

    if (mesText) {
        const mesBlock = mesText.closest('.mes');
        const id = parseInt(mesBlock?.getAttribute('mesid'), 10);
        const context = getContext();

        if (!isNaN(id) && context.chat[id]) {
            // 方式1: 尝试在 extra.images 中解锁
            if (context.chat[id].extra?.images) {
                const key = context.chat[id].swipe_id ?? 0;
                const images = context.chat[id].extra.images[key] || [];

                let found = false;
                for (const img of images) {
                    if (img.tag === tagToUnlock) {
                        img.locked = false;
                        found = true;
                    }
                }

                if (found) {
                    await saveChatConditional();
                    console.log('[imageInserter] Unlocked tag in extra.images:', tagToUnlock);
                    return { success: true, message: 'Tag 已解锁' };
                }
            }

            // 方式2: insertOriginalText 模式 - 从 extra.lockedTags 中移除
            if (context.chat[id].extra?.lockedTags) {
                const idx = context.chat[id].extra.lockedTags.indexOf(tagToUnlock);
                if (idx !== -1) {
                    context.chat[id].extra.lockedTags.splice(idx, 1);
                    await saveChatConditional();
                    console.log('[imageInserter] Unlocked tag from extra.lockedTags:', tagToUnlock);
                    return { success: true, message: 'Tag 已解锁' };
                }
            }

            // 方式3: 备选 - 在 image_groups 中按 tag 全局搜索
            const searchResult = await findTagInImageGroups(tagToUnlock);
            if (searchResult) {
                const imageGroups = await getcharData('image_groups') || {};
                const images = imageGroups[searchResult.elKey];
                if (images && images[searchResult.index]) {
                    images[searchResult.index].locked = false;
                    await setcharData('image_groups', imageGroups);
                    console.log('[imageInserter] Unlocked tag in image_groups (fallback from mesText):', tagToUnlock);
                    return { success: true, message: 'Tag 已解锁' };
                }
            }

            return { success: false, message: '未找到匹配的 tag' };
        }
    } else {
        // chatMetadata - 优先使用 elKey 定位，失败则按 tag 全局搜索
        const logicalText = getCleanLogicalText(el);
        const elKey = generateElKey(logicalText);

        if (elKey) {
            const imageGroups = await getcharData('image_groups') || {};
            const images = imageGroups[elKey] || [];

            let found = false;
            for (const img of images) {
                if (img.tag === tagToUnlock) {
                    img.locked = false;
                    found = true;
                }
            }

            if (found) {
                imageGroups[elKey] = images;
                await setcharData('image_groups', imageGroups);
                console.log('[imageInserter] Unlocked tag in metadata:', tagToUnlock);
                return { success: true, message: 'Tag 已解锁' };
            }
        }

        // 备选方案：按 tag 内容全局搜索 image_groups
        const searchResult = await findTagInImageGroups(tagToUnlock);
        if (searchResult) {
            const imageGroups = await getcharData('image_groups') || {};
            const images = imageGroups[searchResult.elKey];
            if (images && images[searchResult.index]) {
                images[searchResult.index].locked = false;
                await setcharData('image_groups', imageGroups);
                console.log('[imageInserter] Unlocked tag in metadata (global search):', tagToUnlock);
                return { success: true, message: 'Tag 已解锁' };
            }
        }
    }

    return { success: false, message: '未找到匹配的 tag' };
}

/**
 * 检查指定 tag 是否已锁定
 * @param {HTMLElement} el - 元素（用于定位存储位置）
 * @param {string} tagToCheck - 要检查的 tag 内容
 * @returns {Promise<boolean>}
 */
export async function isTagLocked(el, tagToCheck) {
    if (!el || !tagToCheck) {
        return false;
    }

    const mesText = findMesTextFromElement(el);

    if (mesText) {
        const mesBlock = mesText.closest('.mes');
        const id = parseInt(mesBlock?.getAttribute('mesid'), 10);
        const context = getContext();

        if (!isNaN(id) && context.chat[id]) {
            // 方式1: 检查 extra.images
            if (context.chat[id].extra?.images) {
                const key = context.chat[id].swipe_id ?? 0;
                const images = context.chat[id].extra.images[key] || [];

                for (const img of images) {
                    if (img.tag === tagToCheck) {
                        return img.locked === true;
                    }
                }
            }

            // 方式2: 检查 extra.lockedTags (insertOriginalText 模式)
            if (context.chat[id].extra?.lockedTags) {
                if (context.chat[id].extra.lockedTags.includes(tagToCheck)) {
                    return true;
                }
            }

            // 方式3: 备选 - 在 image_groups 中按 tag 全局搜索
            const searchResult = await findTagInImageGroups(tagToCheck);
            if (searchResult) {
                return searchResult.images[searchResult.index]?.locked === true;
            }
        }
    } else {
        // chatMetadata - 优先使用 elKey 定位，失败则按 tag 全局搜索
        const logicalText = getCleanLogicalText(el);
        const elKey = generateElKey(logicalText);

        if (elKey) {
            const imageGroups = await getcharData('image_groups') || {};
            const images = imageGroups[elKey] || [];

            for (const img of images) {
                if (img.tag === tagToCheck) {
                    return img.locked === true;
                }
            }
        }

        // 备选方案：按 tag 内容全局搜索 image_groups
        const searchResult = await findTagInImageGroups(tagToCheck);
        if (searchResult) {
            return searchResult.images[searchResult.index]?.locked === true;
        }
    }

    return false;
}

/**
 * 锁定元素关联的所有 tag
 * @param {HTMLElement} el - 元素（用于定位存储位置）
 * @returns {Promise<{success: boolean, message: string, count: number}>}
 */
export async function lockAllTagsForElement(el) {
    if (!el) {
        return { success: false, message: '参数无效', count: 0 };
    }

    const mesText = findMesTextFromElement(el);
    let lockedCount = 0;

    if (mesText) {
        const mesBlock = mesText.closest('.mes');
        const id = parseInt(mesBlock?.getAttribute('mesid'), 10);
        const context = getContext();

        if (!isNaN(id) && context.chat[id]) {
            // 确保 extra 存在
            if (!context.chat[id].extra) {
                context.chat[id].extra = {};
            }

            // 方式1: 锁定 extra.images 中的所有 tag
            if (context.chat[id].extra.images) {
                const key = context.chat[id].swipe_id ?? 0;
                const images = context.chat[id].extra.images[key] || [];

                for (const img of images) {
                    if (!img.locked) {
                        img.locked = true;
                        lockedCount++;
                    }
                }
            }

            // 方式2: 从 mes 正文中提取所有 tag 并添加到 lockedTags
            if (context.chat[id].mes && context.chat[id].mes.length > 100) {
                const mesTagRegex = /image###([\s\S]*?)###/g;
                let match;
                const tagsInMes = [];

                while ((match = mesTagRegex.exec(context.chat[id].mes)) !== null) {
                    tagsInMes.push(match[1].trim());
                }

                if (tagsInMes.length > 0) {
                    // 初始化 lockedTags 数组
                    if (!context.chat[id].extra.lockedTags) {
                        context.chat[id].extra.lockedTags = [];
                    }

                    for (const tag of tagsInMes) {
                        if (!context.chat[id].extra.lockedTags.includes(tag)) {
                            context.chat[id].extra.lockedTags.push(tag);
                            lockedCount++;
                        }
                    }
                }
            }

            // 方式3: 同时锁定 image_groups 中的 tag
            const logicalText = getCleanLogicalText(el);
            const elKey = generateElKey(logicalText);
            if (elKey) {
                const imageGroups = await getcharData('image_groups') || {};
                const imagesInGroups = imageGroups[elKey] || [];

                for (const img of imagesInGroups) {
                    if (!img.locked) {
                        img.locked = true;
                        lockedCount++;
                    }
                }

                if (imagesInGroups.length > 0) {
                    imageGroups[elKey] = imagesInGroups;
                    await setcharData('image_groups', imageGroups);
                    console.log('[imageInserter] Also locked tags in image_groups, elKey:', elKey);
                }
            }

            if (lockedCount > 0) {
                await saveChatConditional();
                console.log('[imageInserter] Locked all tags for element, count:', lockedCount);
                return { success: true, message: `已锁定 ${lockedCount} 个 Tag`, count: lockedCount };
            }

            return { success: false, message: '没有找到可锁定的 Tag', count: 0 };
        }
    } else {
        // chatMetadata
        const logicalText = getCleanLogicalText(el);
        const elKey = generateElKey(logicalText);

        if (elKey) {
            const imageGroups = await getcharData('image_groups') || {};
            const images = imageGroups[elKey] || [];

            for (const img of images) {
                if (!img.locked) {
                    img.locked = true;
                    lockedCount++;
                }
            }

            if (lockedCount > 0) {
                imageGroups[elKey] = images;
                await setcharData('image_groups', imageGroups);
                console.log('[imageInserter] Locked all tags in metadata, count:', lockedCount);
                return { success: true, message: `已锁定 ${lockedCount} 个 Tag`, count: lockedCount };
            }
        }
    }

    return { success: false, message: '没有找到可锁定的 Tag', count: 0 };
}

/**
 * 解锁元素关联的所有 tag
 * @param {HTMLElement} el - 元素（用于定位存储位置）
 * @returns {Promise<{success: boolean, message: string, count: number}>}
 */
export async function unlockAllTagsForElement(el) {
    if (!el) {
        return { success: false, message: '参数无效', count: 0 };
    }

    const mesText = findMesTextFromElement(el);
    let unlockedCount = 0;

    if (mesText) {
        const mesBlock = mesText.closest('.mes');
        const id = parseInt(mesBlock?.getAttribute('mesid'), 10);
        const context = getContext();

        if (!isNaN(id) && context.chat[id]) {
            // 方式1: 解锁 extra.images 中的所有 tag
            if (context.chat[id].extra?.images) {
                const key = context.chat[id].swipe_id ?? 0;
                const images = context.chat[id].extra.images[key] || [];

                for (const img of images) {
                    if (img.locked) {
                        img.locked = false;
                        unlockedCount++;
                    }
                }
            }

            // 方式2: 清空 lockedTags 数组
            if (context.chat[id].extra?.lockedTags && context.chat[id].extra.lockedTags.length > 0) {
                unlockedCount += context.chat[id].extra.lockedTags.length;
                context.chat[id].extra.lockedTags = [];
            }

            // 方式3: 同时解锁 image_groups 中的 tag
            const logicalText = getCleanLogicalText(el);
            const elKey = generateElKey(logicalText);
            if (elKey) {
                const imageGroups = await getcharData('image_groups') || {};
                const imagesInGroups = imageGroups[elKey] || [];

                for (const img of imagesInGroups) {
                    if (img.locked) {
                        img.locked = false;
                        unlockedCount++;
                    }
                }

                if (imagesInGroups.length > 0) {
                    imageGroups[elKey] = imagesInGroups;
                    await setcharData('image_groups', imageGroups);
                    console.log('[imageInserter] Also unlocked tags in image_groups, elKey:', elKey);
                }
            }

            if (unlockedCount > 0) {
                await saveChatConditional();
                console.log('[imageInserter] Unlocked all tags for element, count:', unlockedCount);
                return { success: true, message: `已解锁 ${unlockedCount} 个 Tag`, count: unlockedCount };
            }

            return { success: false, message: '没有找到已锁定的 Tag', count: 0 };
        }
    } else {
        // chatMetadata
        const logicalText = getCleanLogicalText(el);
        const elKey = generateElKey(logicalText);

        if (elKey) {
            const imageGroups = await getcharData('image_groups') || {};
            const images = imageGroups[elKey] || [];

            for (const img of images) {
                if (img.locked) {
                    img.locked = false;
                    unlockedCount++;
                }
            }

            if (unlockedCount > 0) {
                imageGroups[elKey] = images;
                await setcharData('image_groups', imageGroups);
                console.log('[imageInserter] Unlocked all tags in metadata, count:', unlockedCount);
                return { success: true, message: `已解锁 ${unlockedCount} 个 Tag`, count: unlockedCount };
            }
        }
    }

    return { success: false, message: '没有找到已锁定的 Tag', count: 0 };
}

/**
 * 删除指定的单个 tag
 * 从 extra.images、extra.lockedTags、image_groups 三个位置删除
 * @param {HTMLElement} el - 元素（用于定位存储位置）
 * @param {string} tag - 要删除的 tag 内容
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function deleteTagForElement(el, tag) {
    if (!el || !tag) {
        return { success: false, message: '参数无效' };
    }

    const tagToDelete = tag.trim();
    let deletedFromAny = false;

    const mesText = findMesTextFromElement(el);

    if (mesText) {
        const mesBlock = mesText.closest('.mes');
        const id = parseInt(mesBlock?.getAttribute('mesid'), 10);
        const context = getContext();

        if (!isNaN(id) && context.chat[id]) {
            // 1. 从 extra.images 中删除
            if (context.chat[id].extra?.images) {
                const key = context.chat[id].swipe_id ?? 0;
                const images = context.chat[id].extra.images[key] || [];
                const originalLength = images.length;
                context.chat[id].extra.images[key] = images.filter(img => img.tag?.trim() !== tagToDelete);
                if (context.chat[id].extra.images[key].length < originalLength) {
                    deletedFromAny = true;
                    console.log('[imageInserter] Deleted tag from extra.images');
                }
            }

            // 2. 从 extra.lockedTags 中删除
            if (context.chat[id].extra?.lockedTags) {
                const originalLength = context.chat[id].extra.lockedTags.length;
                context.chat[id].extra.lockedTags = context.chat[id].extra.lockedTags.filter(t => t.trim() !== tagToDelete);
                if (context.chat[id].extra.lockedTags.length < originalLength) {
                    deletedFromAny = true;
                    console.log('[imageInserter] Deleted tag from extra.lockedTags');
                }
            }

            // 3. 从正文 mes 中删除 tag（insertOriginalText 模式）
            if (context.chat[id].mes) {
                const tagPattern = new RegExp(`\\n*<image>image###${escapeRegExp(tagToDelete)}###</image>`, 'g');
                const tagPattern2 = new RegExp(`\\n*image###${escapeRegExp(tagToDelete)}###`, 'g');
                const originalMes = context.chat[id].mes;
                let newMes = originalMes.replace(tagPattern, '');
                newMes = newMes.replace(tagPattern2, '');
                if (newMes !== originalMes) {
                    context.chat[id].mes = newMes;
                    deletedFromAny = true;
                    console.log('[imageInserter] Deleted tag from mes content');
                }
            }

            if (deletedFromAny) {
                await saveChatConditional();
            }
        }
    }

    // 4. 从 image_groups 中删除
    const logicalText = getCleanLogicalText(el);
    const elKey = generateElKey(logicalText);
    if (elKey) {
        const imageGroups = await getcharData('image_groups') || {};
        const images = imageGroups[elKey] || [];
        const originalLength = images.length;
        const filteredImages = images.filter(img => img.tag?.trim() !== tagToDelete);

        if (filteredImages.length < originalLength) {
            imageGroups[elKey] = filteredImages;
            await setcharData('image_groups', imageGroups);
            deletedFromAny = true;
            console.log('[imageInserter] Deleted tag from image_groups');
        }
    }

    if (deletedFromAny) {
        return { success: true, message: 'Tag 已删除' };
    }

    return { success: false, message: '未找到该 Tag' };
}

/**
 * 转义正则表达式特殊字符
 * @param {string} string - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
