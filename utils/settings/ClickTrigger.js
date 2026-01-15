// @ts-nocheck
/**
 * 点击触发模块 - 模仿手势触发功能
 * 
 * 通过双击 mes_text 元素弹出操作选择对话框，
 * 触发与手势相同的功能（图片生成、角色设计）
 */

import { extension_settings } from "../../../../../extensions.js";
import { extensionName } from "../config.js";
import { handlePromptRequest } from "../promptReq.js";
import { handleCharacterDesignRequest } from "../characterGen.js";

// 轮询定时器
let clickPollingTimer = null;

// 存储已绑定的元素（使用 WeakSet 避免内存泄漏）
let boundElements = new WeakSet();

// 存储当前显示的 overlay（用于关闭）
let currentOverlay = null;

/**
 * 设备检测 - 判断是否为移动设备
 */
function isMobile() {
    const touchSupported = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const screenSmall = window.innerWidth < 768;
    return touchSupported && screenSmall;
}

/**
 * 获取事件坐标
 * @param {MouseEvent|TouchEvent} e 
 * @returns {{x: number, y: number}}
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
 * 关闭当前显示的 action bubble
 */
function closeActionBubble() {
    if (currentOverlay) {
        currentOverlay.classList.add('closing');
        setTimeout(() => {
            if (currentOverlay && currentOverlay.parentNode) {
                currentOverlay.remove();
            }
            currentOverlay = null;
        }, 150);
    }
}

/**
 * 显示操作选择对话框
 * @param {MouseEvent|TouchEvent} e - 点击事件
 * @param {HTMLElement} targetElement - 触发的目标元素
 */
function showClickActionBubble(e, targetElement) {
    // 移除已存在的 bubble
    closeActionBubble();

    const point = getEventPoint(e);

    // 创建 overlay
    const overlay = document.createElement('div');
    overlay.className = 'st-chatu8-click-trigger-overlay';
    currentOverlay = overlay;

    // 创建 bubble
    const bubble = document.createElement('div');
    bubble.className = 'st-chatu8-click-trigger-bubble';

    // 标题
    const title = document.createElement('div');
    title.className = 'st-chatu8-click-trigger-title';
    title.textContent = '选择操作';
    bubble.appendChild(title);

    // 按钮配置
    const buttons = [
        {
            text: '图片生成',
            icon: 'fa-solid fa-image',
            description: '生成当前场景相关的图片',
            action: () => {
                console.log('[点击触发] 触发图片生成');
                handlePromptRequest(targetElement, 'gesture1');
            }
        },
        {
            text: '角色/服装设计',
            icon: 'fa-solid fa-user-pen',
            description: '生成角色或服装设计',
            action: () => {
                console.log('[点击触发] 触发角色/服装设计');
                handleCharacterDesignRequest(targetElement);
            }
        },
        {
            text: '取消',
            icon: 'fa-solid fa-xmark',
            isCancel: true,
            action: () => {
                console.log('[点击触发] 用户取消');
            }
        }
    ];

    // 创建按钮
    buttons.forEach(btnInfo => {
        const button = document.createElement('button');
        button.className = 'st-chatu8-click-trigger-button';
        if (btnInfo.isCancel) {
            button.classList.add('cancel');
        }
        button.innerHTML = `<i class="${btnInfo.icon}"></i><span>${btnInfo.text}</span>`;
        button.onclick = () => {
            closeActionBubble();
            btnInfo.action();

            // 清除文字选中
            if (window.getSelection) {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    selection.removeAllRanges();
                }
            }
        };
        bubble.appendChild(button);
    });

    overlay.appendChild(bubble);
    document.body.appendChild(overlay);

    // --- 定位逻辑 ---
    const bubbleRect = bubble.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newLeft = point.x;
    let newTop = point.y;

    // 水平方向：确保不超出视口
    if (newLeft + bubbleRect.width > viewportWidth) {
        newLeft = viewportWidth - bubbleRect.width - 10;
    }
    if (newLeft < 10) {
        newLeft = 10;
    }

    // 垂直方向：确保不超出视口
    if (newTop + bubbleRect.height > viewportHeight) {
        newTop = point.y - bubbleRect.height - 10;
    }
    if (newTop < 10) {
        newTop = 10;
    }

    bubble.style.left = `${newLeft}px`;
    bubble.style.top = `${newTop}px`;

    // 不再通过点击 overlay 关闭，只能通过取消按钮或 ESC 键关闭

    // ESC 键关闭
    const escHandler = (evt) => {
        if (evt.key === 'Escape') {
            closeActionBubble();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * 处理双击事件
 * @param {MouseEvent|TouchEvent} e 
 * @param {HTMLElement} targetElement 
 */
function handleDoubleClick(e, targetElement) {
    // 如果弹窗已显示，忽略新的双击事件
    if (currentOverlay) {
        console.log('[点击触发] 弹窗已显示，忽略双击');
        return;
    }

    // 检查插件是否启用
    if (!extension_settings[extensionName]?.clickTriggerEnabled) {
        console.log('[点击触发] 功能未启用');
        return;
    }

    // 排除不应触发的元素
    const excludedTags = new Set(['IMG', 'BUTTON', 'SELECT', 'INPUT', 'TEXTAREA', 'A', 'VIDEO', 'AUDIO', 'CANVAS', 'SVG']);
    if (excludedTags.has(e.target.tagName?.toUpperCase())) {
        console.log(`[点击触发] 点击的是 ${e.target.tagName?.toUpperCase()} 元素，忽略`);
        return;
    }

    console.log('[点击触发] 双击触发成功');
    showClickActionBubble(e, targetElement);
}

/**
 * 绑定双击事件到元素
 * @param {HTMLElement} element 
 * @param {Document} doc 
 */
function bindClickTrigger(element, doc = document) {
    if (boundElements.has(element)) return;
    boundElements.add(element);

    // 动态查找 mes_text 元素（模仿 Drawing.js 的逻辑）
    function findTargetElement(e) {
        // 先尝试从 e.target 查找 mes_text
        let targetEl = e.target.closest('.mes_text');

        // 如果在 iframe 中且没有找到 mes_text，查找最近的 div
        if (!targetEl && doc.defaultView?.frameElement) {
            let currentEl = e.target;
            if (currentEl.tagName !== 'DIV') {
                currentEl = currentEl.closest('div');
            }
            if (currentEl) {
                targetEl = currentEl;
            }
        }

        // 兜底：使用绑定的元素
        return targetEl || element;
    }

    // 桌面端：原生 dblclick，使用捕获模式确保能捕获到事件
    element.addEventListener('dblclick', (e) => {
        const targetEl = findTargetElement(e);
        console.log('[点击触发] 桌面端双击, target:', targetEl.tagName, targetEl.className);
        handleDoubleClick(e, targetEl);
    }, true);  // capture: true

    // 移动端：触摸双击检测
    let lastTapTime = 0;
    let lastTapPoint = { x: 0, y: 0 };
    const doubleTapThreshold = 350; // 适当放宽时间阈值（移动端用户操作可能稍慢）
    const doubleTapDistance = 50;   // 两次触摸的最大距离阈值（像素）

    element.addEventListener('touchend', (e) => {
        // 只响应单指触摸
        if (e.changedTouches.length !== 1) {
            return;
        }

        const currentTime = Date.now();
        const currentPoint = getEventPoint(e);
        const timeSinceLastTap = currentTime - lastTapTime;

        // 计算两次触摸的距离
        const distance = Math.sqrt(
            Math.pow(currentPoint.x - lastTapPoint.x, 2) +
            Math.pow(currentPoint.y - lastTapPoint.y, 2)
        );

        if (timeSinceLastTap < doubleTapThreshold && timeSinceLastTap > 0 && distance < doubleTapDistance) {
            // 阻止浏览器默认的双击缩放行为
            e.preventDefault();

            const targetEl = findTargetElement(e);
            console.log('[点击触发] 移动端触摸双击, target:', targetEl.tagName, targetEl.className);
            handleDoubleClick(e, targetEl);
            lastTapTime = 0;
            lastTapPoint = { x: 0, y: 0 };
        } else {
            lastTapTime = currentTime;
            lastTapPoint = currentPoint;
        }
    }, { capture: true, passive: false });  // passive: false 允许调用 preventDefault

    console.log('[点击触发] ✓ 已绑定:', element.className || element.tagName);
}

/**
 * 扫描并绑定 mes_text 元素
 */
function scanClickTriggerElements() {
    const mesTextElements = document.getElementsByClassName('mes_text');
    let count = 0;
    let alreadyBound = 0;

    for (const element of mesTextElements) {
        if (!boundElements.has(element)) {
            bindClickTrigger(element, document);
            count++;
        } else {
            alreadyBound++;
        }
    }

    console.log(`[点击触发] 扫描: 总共${mesTextElements.length}个mes_text, 新绑定${count}个, 已绑定${alreadyBound}个`);

    // 扫描 iframe
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        try {
            const iframeDoc = iframe.contentDocument;
            if (!iframeDoc || !iframeDoc.body) return;

            if (!boundElements.has(iframeDoc.body)) {
                bindClickTrigger(iframeDoc.body, iframeDoc);
                count++;
            }

            const iframeMesTexts = iframeDoc.getElementsByClassName('mes_text');
            for (const element of iframeMesTexts) {
                if (!boundElements.has(element)) {
                    bindClickTrigger(element, iframeDoc);
                    count++;
                }
            }
        } catch (e) {
            // 跨域忽略
        }
    });

    if (count > 0) {
        console.log(`[点击触发] 本次扫描绑定了 ${count} 个元素`);
    }
}

/**
 * 初始化点击触发监控
 */
function initClickTriggerMonitor() {
    console.log('[点击触发] ====== 初始化点击触发监控 ======');

    if (clickPollingTimer) {
        console.log('[点击触发] 已在运行');
        return;
    }

    // 先设置轮询定时器，确保一定会被设置
    clickPollingTimer = setInterval(() => {
        try {
            scanClickTriggerElements();
        } catch (e) {
            console.error('[点击触发] 扫描出错:', e);
        }
    }, 3000);

    // 然后立即执行一次扫描
    try {
        scanClickTriggerElements();
    } catch (e) {
        console.error('[点击触发] 初始扫描出错:', e);
    }

    console.log('[点击触发] ✓ 已启动');
}

/**
 * 停止点击触发监控
 */
function stopClickTriggerMonitor() {
    console.log('[点击触发] ====== 停止监控 ======');

    if (clickPollingTimer) {
        clearInterval(clickPollingTimer);
        clickPollingTimer = null;
    }

    // 重新创建 WeakSet，清除所有绑定记录，以便下次可以重新绑定
    boundElements = new WeakSet();

    // 关闭当前 bubble
    closeActionBubble();

    console.log('[点击触发] ✓ 已停止');
}

/**
 * 自动启动监控
 */
function startClickTriggerMonitor() {
    // 延迟启动，等待 SillyTavern 完全加载
    const startWithDelay = () => {
        setTimeout(() => {
            console.log('[点击触发] 延迟启动...');
            initClickTriggerMonitor();
        }, 3000);  // 延迟3秒等待页面稳定
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startWithDelay);
    } else {
        startWithDelay();
    }
}

// 模块加载时自动启动
startClickTriggerMonitor();

export { initClickTriggerMonitor, stopClickTriggerMonitor, scanClickTriggerElements };

