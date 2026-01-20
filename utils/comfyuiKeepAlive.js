// @ts-nocheck
/**
 * ComfyUI 保活模块
 * 当插件启用且模式为 comfyui 时，定期发送 ping 请求保活
 */

import { extension_settings } from "../../../../extensions.js";
import { extensionName } from './config.js';
import { getRequestHeaders } from './utils.js';

// 保活定时器
let keepAliveTimer = null;

// 保活间隔（毫秒）- 默认 10 秒
const KEEP_ALIVE_INTERVAL = 10000;

/**
 * 检查插件是否启用且模式为 comfyui
 * @returns {boolean}
 */
function shouldKeepAlive() {
    const settings = extension_settings[extensionName];
    if (!settings) return false;

    // 检查插件是否启用
    const isEnabled = settings.scriptEnabled === true || settings.scriptEnabled === "true";
    // 检查模式是否为 comfyui
    const isComfyUIMode = settings.mode === 'comfyui';

    return isEnabled && isComfyUIMode;
}

/**
 * 向 SillyTavern 后端发送 ping 请求（通过酒馆后端代理）
 */
async function pingViaSillyTavern() {
    try {
        const comfyUrl = extension_settings[extensionName]?.comfyuiUrl?.trim();
        if (!comfyUrl) {
            console.log('[ComfyUI KeepAlive] ComfyUI URL 未设置');
            return;
        }

        const result = await fetch('/api/sd/comfy/ping', {
            method: 'POST',
            headers: getRequestHeaders(window.token),
            body: JSON.stringify({
                url: comfyUrl,
            }),
        });

        // 不论成功与否，只负责保活，不处理结果
        if (result.ok) {
            console.log('[ComfyUI KeepAlive] Ping 成功 (via SillyTavern)');
        } else {
            console.log('[ComfyUI KeepAlive] Ping 失败 (via SillyTavern):', result.status);
        }
    } catch (error) {
        console.log('[ComfyUI KeepAlive] Ping 异常 (via SillyTavern):', error.message);
    }
}

/**
 * 直接向 ComfyUI 发送 ping 请求（浏览器端直连）
 */
async function pingDirect() {
    try {
        const comfyUrl = extension_settings[extensionName]?.comfyuiUrl?.trim();
        if (!comfyUrl) {
            console.log('[ComfyUI KeepAlive] ComfyUI URL 未设置');
            return;
        }

        // 使用 /system_stats 接口进行保活检测
        const result = await fetch(`${comfyUrl}/system_stats`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        // 不论成功与否，只负责保活，不处理结果
        if (result.ok) {
            console.log('[ComfyUI KeepAlive] Ping 成功 (direct)');
        } else {
            console.log('[ComfyUI KeepAlive] Ping 失败 (direct):', result.status);
        }
    } catch (error) {
        console.log('[ComfyUI KeepAlive] Ping 异常 (direct):', error.message);
    }
}

/**
 * 执行保活 ping
 * 根据 client 配置决定使用哪种方式
 */
async function doPing() {
    if (!shouldKeepAlive()) {
        console.log('[ComfyUI KeepAlive] 条件不满足，跳过 ping');
        return;
    }

    const client = extension_settings[extensionName]?.client;

    if (client === 'jiuguan') {
        // 通过酒馆后端代理
        await pingViaSillyTavern();
    } else {
        // 浏览器直连
        await pingDirect();
    }
}

/**
 * 启动保活定时器
 */
export function startKeepAlive() {
    // 如果已经有定时器在运行，先停止
    stopKeepAlive();

    if (!shouldKeepAlive()) {
        console.log('[ComfyUI KeepAlive] 条件不满足，不启动保活');
        return;
    }

    console.log('[ComfyUI KeepAlive] 启动保活定时器，间隔:', KEEP_ALIVE_INTERVAL, 'ms');

    // 立即执行一次
    doPing();

    // 设置定时器
    keepAliveTimer = setInterval(doPing, KEEP_ALIVE_INTERVAL);
}

/**
 * 停止保活定时器
 */
export function stopKeepAlive() {
    if (keepAliveTimer) {
        console.log('[ComfyUI KeepAlive] 停止保活定时器');
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
    }
}

/**
 * 更新保活状态
 * 当设置变更时调用此函数
 */
export function updateKeepAliveStatus() {
    if (shouldKeepAlive()) {
        // 如果定时器已经在运行，不需要重启
        if (!keepAliveTimer) {
            startKeepAlive();
        }
    } else {
        stopKeepAlive();
    }
}

/**
 * 初始化保活模块
 */
export function initializeKeepAlive() {
    console.log('[ComfyUI KeepAlive] 初始化保活模块');
    updateKeepAliveStatus();
}
