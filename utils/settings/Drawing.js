// @ts-nocheck
/**
 * 手势绘制监控模块 - 基于 10x10 网格模板匹配（强制正方形映射）
 */

import { extension_settings } from "../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../script.js";
import { extensionName } from "../config.js";
import { handlePromptRequest } from "../promptReq.js";
import { handleCharacterDesignRequest } from "../characterGen.js";


// 轮询定时器
let gesturePollingTimer = null;

// 存储已绑定的事件处理器，用于移除
const boundEventHandlers = new Map();

// 设备检测
function isMobile() {
    const touchSupported = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const screenSmall = window.innerWidth < 768;
    return touchSupported && screenSmall;
}

// 自定义属性标记
const BINDIED_ATTR = 'data-gesture-bindied';

// 手势状态
let isDrawing = false;
let gesturePoints = [];
let gestureStartTime = 0;
let activeDoc = null;
let activeElement = null;

// 拖动检测
let isPending = false;
let pendingEvent = null;
let startPoint = null;
const MOVE_THRESHOLD = 10;

// 移动端长按检测（长按用于复制文字，不触发手势）
let longPressTimer = null;
let isLongPress = false;
const LONG_PRESS_THRESHOLD = 250; // 长按阈值 250ms（缩短以更快响应）

// 网格参数
const GRID_SIZE = 10;

// 录制模式状态
let isRecording = false;
let recordingResolve = null;

// 阻止右键菜单标记
let shouldBlockContextMenu = false;

// 可视化 canvas
let gestureCanvas = null;
let gestureCtx = null;


/**
 * 将模板字符串转换为二维数组
 */
function parseTemplate(pattern) {
    return pattern.map(row => row.split('').map(c => c === '1' ? 1 : 0));
}

/**
 * 创建手势可视化 canvas
 */
function createGestureCanvas(doc) {
    // 在移动端，如果“显示笔迹”关闭，则不创建 canvas
    if (isMobile() && !extension_settings[extensionName].gestureShowTrail) return;

    const existing = doc.getElementById('gesture-canvas');
    if (existing) existing.remove();

    gestureCanvas = doc.createElement('canvas');
    gestureCanvas.id = 'gesture-canvas';
    gestureCanvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 99999;
    `;

    const width = doc.documentElement.clientWidth || doc.body.clientWidth || window.innerWidth;
    const height = doc.documentElement.clientHeight || doc.body.clientHeight || window.innerHeight;
    gestureCanvas.width = width;
    gestureCanvas.height = height;

    doc.body.appendChild(gestureCanvas);
    gestureCtx = gestureCanvas.getContext('2d');
}

/**
 * 移除 canvas
 */
function removeGestureCanvas() {
    if (isMobile() && !extension_settings[extensionName].gestureShowTrail) return;
    if (gestureCanvas && gestureCanvas.parentNode) {
        gestureCanvas.remove();
    }
    gestureCanvas = null;
    gestureCtx = null;
}

/**
 * 绘制手势轨迹
 */
function drawGestureTrail() {
    // 在移动端，如果“显示笔迹”关闭，则不绘制
    if (isMobile() && !extension_settings[extensionName].gestureShowTrail) return;
    if (!gestureCtx || gesturePoints.length < 2 || !extension_settings[extensionName].gestureShowTrail) return;

    gestureCtx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
    gestureCtx.beginPath();
    gestureCtx.moveTo(gesturePoints[0].x, gesturePoints[0].y);

    for (let i = 1; i < gesturePoints.length; i++) {
        gestureCtx.lineTo(gesturePoints[i].x, gesturePoints[i].y);
    }

    const trailColor = extension_settings[extensionName].gestureTrailColor ?? '#00ff00';
    gestureCtx.strokeStyle = trailColor;
    gestureCtx.lineWidth = 4;
    gestureCtx.lineCap = 'round';
    gestureCtx.lineJoin = 'round';
    gestureCtx.shadowColor = trailColor;
    gestureCtx.shadowBlur = 10;
    gestureCtx.stroke();
}

/**
 * 计算两点距离
 */
function distance(p1, p2) {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * 计算包围盒
 */
function getBoundingBox(points) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * 将轨迹点转换为 10x10 网格
 * 关键：保持宽高比，将手势居中放入一个正方形区域进行缩放
 */
function pointsToGrid(points) {
    const grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));

    if (points.length < 2) return grid;

    const bbox = getBoundingBox(points);

    // 如果绘制范围过小，则视为一个点
    if (bbox.width < 5 && bbox.height < 5) {
        const gridX = Math.floor(GRID_SIZE / 2);
        const gridY = Math.floor(GRID_SIZE / 2);
        grid[gridY][gridX] = 1;
        return grid;
    }

    // 确定最大尺寸，并以此为基准创建一个正方形的缩放区域
    const maxDim = Math.max(bbox.width, bbox.height);

    // 将手势包围盒在正方形区域内居中
    const centerX = bbox.minX + bbox.width / 2;
    const centerY = bbox.minY + bbox.height / 2;

    const squareBbox = {
        minX: centerX - maxDim / 2,
        minY: centerY - maxDim / 2,
        size: maxDim,
    };

    // 计算缩放比例
    const scale = squareBbox.size > 0 ? GRID_SIZE / squareBbox.size : 0;

    // 遍历所有点，将其映射到网格中
    for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // 根据正方形区域进行归一化和缩放
        const gridX = Math.floor((p.x - squareBbox.minX) * scale);
        const gridY = Math.floor((p.y - squareBbox.minY) * scale);

        const clampedX = Math.min(Math.max(gridX, 0), GRID_SIZE - 1);
        const clampedY = Math.min(Math.max(gridY, 0), GRID_SIZE - 1);

        grid[clampedY][clampedX] = 1;

        // 线段插值，填充点之间的空隙
        if (i > 0) {
            const p1 = points[i - 1];
            const dist = distance(p1, p);
            const steps = Math.max(Math.ceil(dist / 3), 1);

            for (let s = 1; s < steps; s++) {
                const t = s / steps;
                const x = p1.x + (p.x - p1.x) * t;
                const y = p1.y + (p.y - p1.y) * t;

                const gx = Math.floor((x - squareBbox.minX) * scale);
                const gy = Math.floor((y - squareBbox.minY) * scale);

                const c_gx = Math.min(Math.max(gx, 0), GRID_SIZE - 1);
                const c_gy = Math.min(Math.max(gy, 0), GRID_SIZE - 1);

                grid[c_gy][c_gx] = 1;
            }
        }
    }

    return grid;
}

/**
 * 膨胀网格（使线条更粗，增加容错）
 */
function dilateGrid(grid, radius = 1) {
    const result = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(0));

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === 1) {
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;
                        if (ny >= 0 && ny < GRID_SIZE && nx >= 0 && nx < GRID_SIZE) {
                            result[ny][nx] = 1;
                        }
                    }
                }
            }
        }
    }

    return result;
}

/**
 * 计算两个网格的相似度指标
 * @param {number[][]} userGrid 
 * @param {number[][]} templateGrid 
 * @returns {{precision: number, recall: number, jaccard: number}}
 */
function calculateSimilarityMetrics(userGrid, templateGrid) {
    let intersection = 0;
    let userSize = 0;
    let templateSize = 0;

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const userPixel = userGrid[y][x];
            const templatePixel = templateGrid[y][x];

            if (userPixel === 1) userSize++;
            if (templatePixel === 1) templateSize++;
            if (userPixel === 1 && templatePixel === 1) intersection++;
        }
    }

    // 精确率 (Precision): 画的当中，有多少是正确的
    const precision = userSize === 0 ? 0 : intersection / userSize;
    // 召回率 (Recall): 模板当中，画了多少
    const recall = templateSize === 0 ? 0 : intersection / templateSize;

    const union = userSize + templateSize - intersection;
    const jaccard = union === 0 ? 0 : intersection / union;

    return { precision, recall, jaccard };
}

/**
 * 判断轨迹的主方向
 */
function getMainDirection(points) {
    if (points.length < 2) return null;

    const start = points[0];
    const end = points[points.length - 1];

    return {
        dx: end.x - start.x,
        dy: end.y - start.y
    };
}

/**
 * 匹配手势 - 遍历所有模板，返回最高匹配度
 */
function matchGesture(points) {
    const userGrid = pointsToGrid(points);
    const dilatedUserGrid = dilateGrid(userGrid, 1); // 膨胀增加容错

    const gestureTemplates = {
        'gesture1': {
            name: '手势一',
            pattern: extension_settings[extensionName].gesture1,
        },
        'gesture2': {
            name: '手势二',
            pattern: extension_settings[extensionName].gesture2,
        }
    };

    const results = [];

    for (const [key, template] of Object.entries(gestureTemplates)) {
        if (!template.pattern || !Array.isArray(template.pattern)) continue;

        const templateGrid = parseTemplate(template.pattern);
        // 关键修复：同时膨胀模板网格，确保比较的对称性
        const dilatedTemplateGrid = dilateGrid(templateGrid, 1);
        const metrics = calculateSimilarityMetrics(dilatedUserGrid, dilatedTemplateGrid);

        // 新的评分策略：使用 F1 分数，它同时平衡了精确率(Precision)和召回率(Recall)
        // - 精确率低 = 画了太多模板外的东西 (overdraw)
        // - 召回率低 = 没画全模板内的东西 (underdraw)
        const { precision, recall } = metrics;
        const score = (precision + recall) === 0 ? 0 : 2 * (precision * recall) / (precision + recall);

        results.push({
            key,
            name: template.name,
            score: score, // F1 score is already between 0 and 1
            jaccard: metrics.jaccard, // 保留用于调试
            precision, // 保留用于调试
            recall, // 保留用于调试
        });
    }

    // 排序取最高
    results.sort((a, b) => b.score - a.score);

    const best = results[0];
    best.allResults = results.slice(0, 5);

    const threshold = (extension_settings[extensionName].gestureMatchThreshold ?? 60) / 100;

    if (best.score < threshold) {
        return {
            key: 'unknown',
            name: '未识别',
            score: best.score,
            allResults: results.slice(0, 5)
        };
    }

    return best;
}

/**
 * 网格转字符串
 */
function gridToString(grid) {
    return grid.map(row => row.map(c => c ? '█' : '·').join('')).join('\n');
}

/**
 * 获取手势 emoji
 */
function getGestureEmoji(key) {
    const emojis = {
        'gesture1': '1️⃣',
        'gesture2': '2️⃣',
        'unknown': '❓'
    };
    return emojis[key] || '❓';
}

/**
 * 显示手势结果
 */
function showGestureResult(doc, result, userGrid, targetElement) {
    // 在移动端，如果“显示笔迹”关闭，则不显示结果
    if (isMobile() && !extension_settings[extensionName].gestureShowTrail) return;
    // 根据设置决定是否显示
    if (!extension_settings[extensionName].gestureShowRecognition) {
        console.log('[手势] 已禁用识别结果展示。');
        return;
    }

    const targetDoc = doc || document;

    const existing = targetDoc.getElementById('gesture-result');
    if (existing) existing.remove();

    const resultDiv = targetDoc.createElement('div');
    resultDiv.id = 'gesture-result';

    const isSuccess = result.key !== 'unknown';
    const score = Math.round(result.score * 100);

    let topStyle = '50%';
    let transformStyle = 'translate(-50%, -50%)';

    // 在移动设备上，将结果窗口对齐到顶部设置栏下方，以获得更好的可见性。
    if (isMobile()) {
        const topSettingsHolder = targetDoc.querySelector('#top-settings-holder');
        if (topSettingsHolder) {
            const rect = topSettingsHolder.getBoundingClientRect();
            topStyle = `${rect.bottom + 10}px`; // 10px margin
            transformStyle = 'translateX(-50%)';
        }
    }

    resultDiv.style.cssText = `
        position: fixed;
        top: ${topStyle};
        left: 50%;
        transform: ${transformStyle};
        background: rgba(0, 0, 0, 0.95);
        color: #fff;
        padding: 20px;
        border-radius: 16px;
        font-size: 14px;
        z-index: 100000;
        text-align: center;
        width: min(90vw, 340px);
        box-sizing: border-box;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        border: 2px solid ${isSuccess ? '#00ff00' : '#ff6600'};
        font-family: monospace;
    `;

    const topResults = result.allResults.map((r, i) =>
        `<span style="color: ${i === 0 ? '#0f0' : '#666'}">${i + 1}. ${r.name} (${Math.round(r.score * 100)}%)</span>`
    ).join('<br>');

    const gestureTemplates = {
        'gesture1': { pattern: extension_settings[extensionName].gesture1 },
        'gesture2': { pattern: extension_settings[extensionName].gesture2 }
    };

    resultDiv.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 10px;">
            ${getGestureEmoji(result.key)}
        </div>
        
        <div style="font-size: 22px; font-weight: bold; margin-bottom: 6px; color: ${isSuccess ? '#00ff00' : '#ff6600'};">
            ${result.name}
        </div>
        
        <div style="color: #888; font-size: 13px; margin-bottom: 14px;">
            匹配度: ${score}%
        </div>
        
        <div style="display: flex; justify-content: center; gap: 16px; margin-bottom: 14px;">
            <div>
                <div style="color: #666; font-size: 10px; margin-bottom: 4px;">你画的 (正方形化)</div>
                <div style="font-size: 10px; line-height: 1.1; color: #0f0; background: #111; padding: 6px; border-radius: 4px;">
                    <pre style="margin: 0;">${gridToString(userGrid)}</pre>
                </div>
            </div>
            ${(isSuccess && gestureTemplates[result.key].pattern) ? `
            <div>
                <div style="color: #666; font-size: 10px; margin-bottom: 4px;">模板</div>
                <div style="font-size: 10px; line-height: 1.1; color: #0ff; background: #111; padding: 6px; border-radius: 4px;">
                    <pre style="margin: 0;">${gridToString(parseTemplate(gestureTemplates[result.key].pattern))}</pre>
                </div>
            </div>
            ` : ''}
        </div>
        
        <div style="border-top: 1px solid #333; padding-top: 10px; font-size: 11px; text-align: left;">
            <div style="color: #888; margin-bottom: 6px;">候选结果:</div>
            ${topResults}
        </div>
    `;

    targetDoc.body.appendChild(resultDiv);

    setTimeout(() => {
        resultDiv.style.transition = 'opacity 0.3s';
        resultDiv.style.opacity = '0';
        setTimeout(() => resultDiv.remove(), 300);
    }, 3500);
}

/**
 * 显示手势提示
 */
function showGestureHint(doc, text = '🎯 绘制手势...') {
    // 在移动端，如果“显示笔迹”关闭，则不显示提示
    if (isMobile() && !extension_settings[extensionName].gestureShowTrail) return;
    if (!extension_settings[extensionName].gestureShowTrail) return;

    const existing = doc.getElementById('gesture-hint');
    if (existing) existing.remove();

    const hint = doc.createElement('div');
    hint.id = 'gesture-hint';
    hint.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 128, 0, 0.9);
        color: #fff;
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 100000;
        pointer-events: none;
    `;
    hint.textContent = text;
    doc.body.appendChild(hint);

    // Recording hint should stay until recording is done
    if (!isRecording) {
        setTimeout(() => {
            hint.style.transition = 'opacity 0.3s';
            hint.style.opacity = '0';
            setTimeout(() => hint.remove(), 300);
        }, 1500);
    }
}

/**
 * 获取事件坐标
 */
function getEventPoint(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

/**
 * 处理手势完成
 */
function handleGestureComplete(doc, targetElement) {
    // 在移动端，进行滚动检测
    if (isMobile()) {
        const bbox = getBoundingBox(gesturePoints);
        const mainDir = getMainDirection(gesturePoints);
        // 如果垂直移动距离远大于水平移动距离，且移动距离足够长，则判定为滚动
        if (Math.abs(mainDir.dy) > Math.abs(mainDir.dx) * 2.5 && bbox.height > 80) {
            console.log('[手势] 检测为滚动操作，已忽略。');
            return;
        }
    }

    const userGrid = pointsToGrid(gesturePoints);
    const userPattern = userGrid.map(row => row.join(''));

    if (isRecording && recordingResolve) {
        console.log('[手势] 录制完成');
        isRecording = false;
        recordingResolve(userPattern);
        recordingResolve = null;

        const hint = doc.getElementById('gesture-hint');
        if (hint) hint.remove();

        toastr.success("手势已录制！");
        return;
    }

    console.log('[手势] ================ 开始识别 ================');
    console.log('[手势] 采集点数:', gesturePoints.length);
    console.log('[手势] 用户网格 (10x10 正方形化):\n' + gridToString(userGrid));

    const result = matchGesture(gesturePoints);

    console.log('[手势] 识别结果:', result.name);
    console.log('[手势] 匹配度:', Math.round(result.score * 100) + '%');
    console.log('[手势] 前2候选:', result.allResults.map(r => `${r.name}(${Math.round(r.score * 100)}%)`).join(', '));
    console.log('[手势] ================================================');

    if (result.key !== 'unknown') {
        // 手势路由：根据手势类型调用不同的处理函数
        if (result.key === 'gesture1') {
            console.log('[手势] 检测到手势一 - 触发图片生成');
            handlePromptRequest(targetElement, result.key);
        } else if (result.key === 'gesture2') {
            console.log('[手势] 检测到手势二 - 触发角色/服装设计');
            handleCharacterDesignRequest(targetElement);
        }
    }

    const event = new CustomEvent('gesture-complete', {
        detail: {
            gesture: result.key,
            gestureName: result.name,
            score: result.score,
            grid: userGrid,
            targetElement: targetElement,
            points: gesturePoints.slice(),
            allResults: result.allResults
        }
    });
    document.dispatchEvent(event);

    showGestureResult(doc, result, userGrid, targetElement);
}

/**
 * 创建手势处理器
 */
function createGestureHandlers(doc, targetElement = null) {
    function onGestureStart(e) {
        // In recording mode, prevent right-click menu
        if (isRecording) {
            e.preventDefault();
            e.stopPropagation();
        }

        isDrawing = true;
        activeDoc = doc;
        activeElement = targetElement;
        gesturePoints = [getEventPoint(e)];
        gestureStartTime = Date.now();

        createGestureCanvas(doc);
        if (isRecording) {
            showGestureHint(doc, '录制中... 请在屏幕上绘制手势');
        } else {
            showGestureHint(doc);
        }
    }

    function onGestureMove(e) {
        if (!isDrawing) return;

        const point = getEventPoint(e);
        const last = gesturePoints[gesturePoints.length - 1];

        if (distance(last, point) >= 2) {
            gesturePoints.push(point);
            drawGestureTrail();
        }
    }

    function onGestureEnd(e) {
        if (!isDrawing) return;

        isDrawing = false;

        if (gesturePoints.length < 10) {
            removeGestureCanvas();
            gesturePoints = [];
            return;
        }

        handleGestureComplete(doc, activeElement);

        setTimeout(removeGestureCanvas, 500);
        gesturePoints = [];
        activeDoc = null;
        activeElement = null;
    }

    return { onGestureStart, onGestureMove, onGestureEnd };
}

/**
 * 清理状态
 */
function clearPendingState() {
    isPending = false;
    pendingEvent = null;
    startPoint = null;
    // 清理长按定时器
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    isLongPress = false;
}

/**
 * 标记元素
 */
function bindGestureToMesText(element) {
    if (element.hasAttribute(BINDIED_ATTR)) return false;
    element.setAttribute(BINDIED_ATTR, 'true');
    return true;
}

/**
 * 初始化事件监听
 */
function initDocumentGestureEvents(doc = document) {
    if (doc._gestureEventsInitialized) return;
    doc._gestureEventsInitialized = true;

    // 创建事件处理器并存储引用
    const handlers = {
        mousedown: (e) => {
            if (!extension_settings[extensionName].gestureEnabled) return;
            if (isMobile() || (!isRecording && e.button !== 2)) return;

            const mesText = e.target.closest('.mes_text[data-gesture-bindied="true"]');
            let targetEl = mesText;

            if (!targetEl && doc.defaultView.frameElement && doc.body.hasAttribute(BINDIED_ATTR)) {
                let currentEl = e.target;
                if (currentEl.tagName !== 'DIV') {
                    currentEl = currentEl.closest('div');
                }
                if (currentEl) {
                    targetEl = currentEl;
                }
            }

            if (!isRecording && !targetEl) return;

            isPending = true;
            startPoint = getEventPoint(e);
            pendingEvent = { target: targetEl || e.target, originalEvent: e };
        },

        mousemove: (e) => {
            if (isMobile()) return;

            if (isPending && pendingEvent && !isDrawing) {
                const point = getEventPoint(e);
                if (distance(startPoint, point) >= MOVE_THRESHOLD) {
                    isPending = false;
                    shouldBlockContextMenu = true;

                    const gestureHandlers = createGestureHandlers(doc, pendingEvent.target);
                    doc._currentGestureHandlers = gestureHandlers;
                    gestureHandlers.onGestureStart(pendingEvent.originalEvent);
                    gesturePoints.push(point);
                    drawGestureTrail();
                }
            }

            if (doc._currentGestureHandlers && isDrawing) {
                doc._currentGestureHandlers.onGestureMove(e);
            }
        },

        mouseup: (e) => {
            if (isMobile() || (!isDrawing && !isPending)) return;
            if (!isRecording && e.button !== 2) return;

            if (isPending && !isDrawing) {
                clearPendingState();
                return;
            }

            if (isDrawing && doc._currentGestureHandlers) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                doc._currentGestureHandlers.onGestureEnd(e);
                doc._currentGestureHandlers = null;
                clearPendingState();

                setTimeout(() => { shouldBlockContextMenu = false; }, 100);
            }
        },

        contextmenu: (e) => {
            if (isMobile() || shouldBlockContextMenu || isDrawing) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return false;
            }
        },

        touchstart: (e) => {
            if (!extension_settings[extensionName].gestureEnabled) return;
            if (!isMobile() || e.touches.length !== 1) return;

            const mesText = e.target.closest('.mes_text[data-gesture-bindied="true"]');
            let targetEl = mesText;

            if (!targetEl && doc.defaultView.frameElement && doc.body.hasAttribute(BINDIED_ATTR)) {
                let currentEl = e.target;
                if (currentEl.tagName !== 'DIV') {
                    currentEl = currentEl.closest('div');
                }
                if (currentEl) {
                    targetEl = currentEl;
                }
            }

            if (!isRecording && !targetEl) return;

            isLongPress = false;
            isPending = false;
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            startPoint = getEventPoint(e);
            pendingEvent = { target: targetEl || e.target, originalEvent: e };

            longPressTimer = setTimeout(() => {
                if (!isDrawing) {
                    isLongPress = true;
                    pendingEvent = null;
                    startPoint = null;
                    console.log('[手势] 检测到长按，放行给系统处理复制');
                }
            }, LONG_PRESS_THRESHOLD);
        },

        touchmove: (e) => {
            if (!isMobile()) return;
            if (isLongPress) return;
            if (!startPoint || !pendingEvent) return;

            if (isDrawing && doc._currentGestureHandlers) {
                doc._currentGestureHandlers.onGestureMove(e);
                return;
            }

            const point = getEventPoint(e);
            if (distance(startPoint, point) >= MOVE_THRESHOLD) {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }

                isPending = false;

                const gestureHandlers = createGestureHandlers(doc, pendingEvent.target);
                doc._currentGestureHandlers = gestureHandlers;
                gestureHandlers.onGestureStart(pendingEvent.originalEvent);
                gesturePoints.push(point);
                drawGestureTrail();
            }
        },

        touchend: (e) => {
            if (!isMobile()) return;

            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (isLongPress) {
                setTimeout(() => {
                    isLongPress = false;
                    startPoint = null;
                    pendingEvent = null;
                }, 1000);
                return;
            }

            if (!isDrawing) {
                startPoint = null;
                pendingEvent = null;
                isPending = false;
                return;
            }

            if (doc._currentGestureHandlers) {
                doc._currentGestureHandlers.onGestureEnd(e);
                doc._currentGestureHandlers = null;
            }
            clearPendingState();
        },

        touchcancel: (e) => {
            if (!isMobile()) return;

            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            if (isLongPress) {
                setTimeout(() => {
                    isLongPress = false;
                    startPoint = null;
                    pendingEvent = null;
                }, 1000);
                return;
            }

            clearPendingState();
            startPoint = null;
            pendingEvent = null;

            if (doc._currentGestureHandlers && isDrawing) {
                isDrawing = false;
                removeGestureCanvas();
                doc._currentGestureHandlers = null;
            }
        }
    };

    // 存储处理器引用
    boundEventHandlers.set(doc, handlers);

    // PC端：右键拖拽
    doc.addEventListener('mousedown', handlers.mousedown, true);
    doc.addEventListener('mousemove', handlers.mousemove, true);
    doc.addEventListener('mouseup', handlers.mouseup, true);
    doc.addEventListener('contextmenu', handlers.contextmenu, true);

    // 移动端触摸事件
    doc.addEventListener('touchstart', handlers.touchstart, { passive: true });
    doc.addEventListener('touchmove', handlers.touchmove, { passive: true });
    doc.addEventListener('touchend', handlers.touchend, { passive: true });
    doc.addEventListener('touchcancel', handlers.touchcancel, { passive: true });
}

/**
 * 移除文档的手势事件监听
 */
function removeDocumentGestureEvents(doc = document) {
    if (!doc._gestureEventsInitialized) return;

    const handlers = boundEventHandlers.get(doc);
    if (handlers) {
        doc.removeEventListener('mousedown', handlers.mousedown, true);
        doc.removeEventListener('mousemove', handlers.mousemove, true);
        doc.removeEventListener('mouseup', handlers.mouseup, true);
        doc.removeEventListener('contextmenu', handlers.contextmenu, true);
        doc.removeEventListener('touchstart', handlers.touchstart, { passive: true });
        doc.removeEventListener('touchmove', handlers.touchmove, { passive: true });
        doc.removeEventListener('touchend', handlers.touchend, { passive: true });
        doc.removeEventListener('touchcancel', handlers.touchcancel, { passive: true });
        boundEventHandlers.delete(doc);
    }

    doc._gestureEventsInitialized = false;
}

/**
 * 扫描元素
 */
function scanGestureElements() {
    initDocumentGestureEvents(document);

    const mesTextElements = document.getElementsByClassName('mes_text');
    for (const element of mesTextElements) {
        bindGestureToMesText(element);
    }

    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        try {
            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc || !iframeDoc.body) return;

            initDocumentGestureEvents(iframeDoc);

            if (!iframeDoc.body.hasAttribute(BINDIED_ATTR)) {
                iframeDoc.body.setAttribute(BINDIED_ATTR, 'true');
            }

            const iframeMesTexts = iframeDoc.getElementsByClassName('mes_text');
            for (const element of iframeMesTexts) {
                bindGestureToMesText(element);
            }
        } catch (e) {
            // 跨域忽略
        }
    });
}

/**
 * 初始化
 */
function initGestureMonitor() {
    console.log('[手势监控] ====== 初始化 (10x10 正方形化网格) ======');
    console.log('[手势监控] 特性: 强制拉伸为正方形 + 膨胀容错 + 动态模板');

    if (gesturePollingTimer) return;

    scanGestureElements();
    gesturePollingTimer = setInterval(scanGestureElements, 3000);

    console.log('[手势监控] ✓ 已启动');
}

/**
 * 停止手势监控，移除所有事件监听
 */
function stopGestureMonitor() {
    console.log('[手势监控] ====== 停止监控 ======');

    // 停止轮询
    if (gesturePollingTimer) {
        clearInterval(gesturePollingTimer);
        gesturePollingTimer = null;
    }

    // 移除主文档的事件监听
    removeDocumentGestureEvents(document);

    // 移除所有 iframe 的事件监听
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        try {
            const iframeDoc = iframe.contentDocument;
            if (iframeDoc) {
                removeDocumentGestureEvents(iframeDoc);
            }
        } catch (e) {
            // 跨域忽略
        }
    });

    // 清理所有绑定标记
    const mesTextElements = document.getElementsByClassName('mes_text');
    for (const element of mesTextElements) {
        element.removeAttribute(BINDIED_ATTR);
    }

    console.log('[手势监控] ✓ 已停止');
}

// 不再自动启动，由外部调用 initGestureMonitor() 来启动

/**
 * 导出录制功能
 */
export async function recordGesture() {
    return new Promise((resolve) => {
        isRecording = true;
        recordingResolve = resolve;
        // Use the main document for the hint
        showGestureHint(document, '准备录制... 请按住鼠标/触摸屏幕开始绘制');
    });
}


export { initGestureMonitor, stopGestureMonitor };
