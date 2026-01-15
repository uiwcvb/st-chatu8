// @ts-nocheck
/**
 * 图片生成触发和显示
 * 包含：triggerGeneration, createAndShowImage
 */

import { eventSource } from "../../../../../../script.js";
import { extension_settings } from "../../../../../extensions.js";
import { EventType, extensionName } from '../config.js';
import { addLog, addSmoothShakeEffect } from '../utils.js';
import { isGenerating, startGenerating, stopGenerating } from '../generation_status.js';
import { getItemImg } from '../database.js';
import { showEditDialog } from './dialogs.js';

// 延迟导入，避免循环依赖
let _showImagePreview = null;

/**
 * 设置 showImagePreview 函数引用
 * @param {Function} fn - showImagePreview 函数
 */
export function setShowImagePreview(fn) {
    _showImagePreview = fn;
}

/**
 * 创建并显示图片/视频元素
 * @param {HTMLElement} container - 容器元素
 * @param {string} imageUrl - 图片/视频 URL
 * @param {string} alt - 替代文本
 * @param {HTMLButtonElement} button - 按钮元素
 * @param {string} change - 变更数据
 * @param {boolean} isVideo - 是否为视频
 */
export function createAndShowImage(container, imageUrl, alt, button, change, isVideo = false) {
    const doc = container.ownerDocument;
    if (!doc) return;
    const div = doc.createElement('div');
    div.className = 'st-chatu8-image-container';

    // Create either video or img element based on media type
    let media;
    if (isVideo) {
        media = doc.createElement('video');
        media.src = imageUrl;
        media.controls = true;
        media.loop = true;
        media.muted = true; // Start muted to allow autoplay
        media.playsInline = true;
        media.style.maxWidth = '100%';
        media.style.height = 'auto';
        media.dataset.isVideo = 'true';
        // Auto play when in view
        media.autoplay = true;

        // 添加错误处理：当视频无法播放时显示下载链接占位符
        media.onerror = function () {
            console.warn('[iframe] Video cannot be played in browser, showing download fallback');
            // 创建一个视频无法播放的占位符
            const fallback = doc.createElement('div');
            fallback.className = 'st-chatu8-video-fallback';
            fallback.style.cssText = `
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                border-radius: 8px;
                padding: 20px;
                min-height: 150px;
                color: #fff;
                text-align: center;
            `;

            // 播放图标
            const icon = doc.createElement('div');
            icon.innerHTML = '🎬';
            icon.style.fontSize = '48px';
            icon.style.marginBottom = '10px';

            // 说明文字
            const text = doc.createElement('div');
            text.textContent = '视频格式不支持浏览器播放';
            text.style.marginBottom = '10px';
            text.style.opacity = '0.8';

            // 下载按钮
            const downloadBtn = doc.createElement('a');
            downloadBtn.href = imageUrl;
            downloadBtn.download = 'video.mp4';
            downloadBtn.textContent = '📥 下载视频';
            downloadBtn.style.cssText = `
                background: rgba(255,255,255,0.2);
                padding: 8px 16px;
                border-radius: 4px;
                color: #fff;
                text-decoration: none;
                cursor: pointer;
            `;
            downloadBtn.onclick = (e) => e.stopPropagation();

            fallback.appendChild(icon);
            fallback.appendChild(text);
            fallback.appendChild(downloadBtn);

            // 替换视频元素
            if (media.parentNode) {
                media.parentNode.replaceChild(fallback, media);
            }
        };
    } else {
        media = doc.createElement('img');
        media.src = imageUrl;
        media.alt = alt;
        media.style.maxWidth = '100%';
        media.style.height = 'auto';
    }

    if (change) {
        button.dataset.change = change ? change : '';
    }
    //img.style.borderRadius = '4px';

    let clickTimer = null;
    let pressTimer = null;
    let isLongPress = false;
    const doubleClickThreshold = 300; // 用于区分单击和双击的阈值 (毫秒)
    const longPressThreshold = 1200; // 长按阈值 (毫秒)

    const handlePressStart = (e) => {
        // 仅处理鼠标左键或触摸事件
        if (e.type === 'mousedown' && e.button !== 0) {
            return;
        }
        isLongPress = false;
        pressTimer = setTimeout(() => {
            pressTimer = null; // 计时器已触发
            isLongPress = true;
            // 如果单击计时器正在运行，则取消它
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            if (button) {
                e.preventDefault(); // 阻止默认行为 (例如，上下文菜单、拖动)
                if (extension_settings[extensionName].longPressToEdit == "true") {
                    showEditDialog(media, button);
                }
            }
        }, longPressThreshold);
    };

    const handlePressEnd = (e) => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    };

    const handleClick = (e) => {
        // 如果检测到长按，则应忽略随后的点击事件
        if (isLongPress) {
            return;
        }

        if (clickTimer) {
            // 这是双击
            clearTimeout(clickTimer);
            clickTimer = null;
            if (extension_settings[extensionName].dbclike === "true" && button) {
                addSmoothShakeEffect(media);
                triggerGeneration(button);
            }
        } else {
            // 这是单击，但我们等待以查看是否是双击
            clickTimer = setTimeout(() => {
                clickTimer = null;
                // 检查是否启用单击预览
                if (button && extension_settings[extensionName].clickToPreview === "true") {
                    if (_showImagePreview) {
                        _showImagePreview(media, button);
                    }
                }
            }, doubleClickThreshold);
        }
    };

    media.addEventListener('click', handleClick);

    // 用于长按的鼠标事件
    media.addEventListener('mousedown', handlePressStart);
    media.addEventListener('mouseup', handlePressEnd);
    media.addEventListener('mouseleave', handlePressEnd);

    // 用于长按的触摸事件
    media.addEventListener('touchstart', handlePressStart);
    media.addEventListener('touchend', handlePressEnd);
    media.addEventListener('touchcancel', handlePressEnd);

    div.appendChild(media);
    container.replaceChildren(div);
}

/**
 * 触发图片生成
 * @param {HTMLButtonElement} button - 生成按钮元素
 */
export const triggerGeneration = (button) => {
    const link = button.dataset.link;
    const requestId = button.dataset.requestId;

    const startGenerationProcess = () => {
        console.log('Triggering generation for button:', button);

        // 先检查是否已在生成中，避免注册多余的事件监听器
        if (isGenerating(link)) {
            addLog(`图像生成请求已在进行中，跳过重复请求: ${link}`);
            toastr.info('图像生成请求已在进行中，跳过重复请求');
            button.setAttribute('data-loading', 'true');
            button.textContent = '加载中...';
            return;
        }

        const imageResponseHandler = (responseData) => {
            if (responseData.id !== requestId) return;

            console.log('Image response:', responseData);

            eventSource.removeListener(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler);
            addLog(`图像响应监听器已销毁 (ID: ${requestId})`);

            const { success, imageData, error, prompt, change, isVideo } = responseData;

            if (prompt) stopGenerating(prompt);

            const docs = [document, ...Array.from(document.querySelectorAll('iframe')).map(f => f.contentDocument).filter(Boolean)];
            docs.forEach(doc => {
                const spans = doc.querySelectorAll(`span[data-request-id="${requestId}"]`);
                const buttons = doc.querySelectorAll(`button[data-request-id="${requestId}"]`);

                if (spans.length > 0) {
                    if (success) {
                        addLog(`${isVideo ? '视频' : '图像'}生成成功 (ID: ${requestId}), targeting ${spans.length} element(s).`);
                        spans.forEach(span => {
                            const associatedButton = span.previousElementSibling;
                            if (associatedButton && associatedButton.matches(`button[data-request-id="${requestId}"]`)) {
                                createAndShowImage(span, imageData, 'Generated Image', associatedButton, change, isVideo);
                            } else {
                                createAndShowImage(span, imageData, 'Generated Image', null, change, isVideo);
                            }
                        });
                        buttons.forEach(b => {
                            b.removeAttribute('data-loading');
                            if (extension_settings[extensionName].dbclike == "true") {
                                b.style.setProperty('display', 'none', 'important');
                            } else {
                                b.disabled = false;
                                b.textContent = '生成图片';
                            }
                        });
                    } else {
                        addLog(`图像生成失败 (ID: ${requestId}): ${error}`);
                        toastr.error(`生成失败: ${error || '未知错误'}`);
                        buttons.forEach(b => {
                            b.removeAttribute('data-loading');
                            b.disabled = false;
                            b.textContent = '生成图片';
                        });
                    }
                }
            });
        };

        eventSource.on(EventType.GENERATE_IMAGE_RESPONSE, imageResponseHandler);
        addLog(`图像响应监听器已创建 (ID: ${requestId})`);

        button.setAttribute('data-loading', 'true');
        button.textContent = '加载中...';
        startGenerating(link);

        const buttonChange = button.dataset.change;
        const requestData = { id: requestId, prompt: link, width: null, height: null };
        if (buttonChange) {
            requestData.change = buttonChange;
            // 如果是修图请求，添加修图指令和图片数据
            if (buttonChange.includes('{修图}')) {
                requestData.retouchPrompt = button.dataset.retouchPrompt || '';
                requestData.retouchImage = button.dataset.retouchImage || '';
                // 发送后移除修图标记，以免影响后续的普通"重新生成"
                button.dataset.change = button.dataset.change.replaceAll('{修图}', '');
            }
        }
        eventSource.emit(EventType.GENERATE_IMAGE_REQUEST, requestData);
        addLog(`发出图像生成请求 (ID: ${requestData.id})`);
    };

    const docs = [document, ...Array.from(document.querySelectorAll('iframe')).map(f => f.contentDocument).filter(Boolean)];
    let imageExistsInDom = false;
    for (const doc of docs) {
        const span = doc.querySelector(`span[data-request-id="${requestId}"]`);
        if (span && span.querySelector('img, video, .st-chatu8-video-fallback')) {
            console.log('Media already exists in DOM. Triggering regeneration.');
            imageExistsInDom = true;
            break;
        }
    }

    if (imageExistsInDom) {
        startGenerationProcess();
    } else {
        getItemImg(link).then(([imageUrl, dbChange, , isVideo]) => {
            if (imageUrl) {
                addLog(`Image for "${link}" already exists in DB.Skipping generation.`);
                for (const doc of docs) {
                    const spans = doc.querySelectorAll(`span[data-request-id= "${requestId}"]`);
                    for (const span of spans) {
                        const associatedButton = span.previousElementSibling;
                        if (associatedButton && associatedButton.matches(`button[data-request-id= "${requestId}"]`)) {
                            createAndShowImage(span, imageUrl, 'Generated Image', associatedButton, dbChange, isVideo);
                            associatedButton.removeAttribute('data-loading');
                            if (extension_settings[extensionName].dbclike === "true") {
                                associatedButton.style.setProperty('display', 'none', 'important');
                            } else {
                                associatedButton.disabled = false;
                                associatedButton.textContent = '生成图片';
                            }
                        }
                    }
                }
            } else {
                startGenerationProcess();
            }
        });
    }
};
