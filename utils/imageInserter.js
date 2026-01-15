// @ts-nocheck
/**
 * imageInserter.js - 图片插入模块
 * 
 * 图片解析和 DOM 插入逻辑
 */

import { setcharData, getcharData } from "./chatDataUtils.js";

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

    // 第一步：提取 <images>...</images> 区域（如果存在）
    let searchText = text;
    const imagesContainerRegex = /<images>([\s\S]*?)<\/images>/;
    const imagesContainerMatch = text.match(imagesContainerRegex);

    if (imagesContainerMatch) {
        searchText = imagesContainerMatch[1];
        console.log('[parseImagesFromPrompt] 找到 <images> 容器，内容长度:', searchText.length);
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

        // 只有当至少有一个有效内容时才添加到数组
        if (regexText || tag) {
            images.push({
                regex: regexText,
                tag: tag
            });
        }
    }

    console.log('[parseImagesFromPrompt] 解析完成，共', images.length, '个有效图片');

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

    // 保存位置信息到 chatMetadata（传入 logicalText 用于检查重 roll 覆盖）
    await saveImageGroup(positionedImages, logicalText);
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
 * 保存一组 images 的位置信息到 chatMetadata
 * 使用 logicalText 中间 20 字符作为主键，直接覆盖
 * @param {Array<{endIndex: number, regex: string, tag: string}>} images
 * @param {string} logicalText - 逻辑文本，用于生成主键
 */
export async function saveImageGroup(images, logicalText) {
    if (!images || images.length === 0) return;

    // 获取现有数据
    const imageGroups = await getcharData('image_groups') || {};

    // 使用中间 20 字符作为主键（O(1) 查找和覆盖）
    const elKey = generateElKey(logicalText);

    if (!elKey) {
        console.warn('[imageInserter] Cannot generate elKey, logicalText too short');
        return;
    }

    const isOverride = !!imageGroups[elKey];

    // 直接用 key 保存/覆盖
    imageGroups[elKey] = images;

    await setcharData('image_groups', imageGroups);

    console.log('[imageInserter] Saved image group:', elKey, images, isOverride ? '(overridden)' : '(new)');
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
