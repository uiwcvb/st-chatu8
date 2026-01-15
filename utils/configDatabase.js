// @ts-nocheck
/**
 * 插件配置图片数据库管理模块
 * 
 * 用于存储插件配置相关的少量图片（如角色头像、预设图片等）。
 * 独立于聊天图片数据库（database.js），提供简化的 API。
 * 
 * 存储策略：
 * - jiuguanchucun === "true" → 存储到酒馆服务器
 * - 否则 → 存储到浏览器 IndexedDB
 */

import { extension_settings } from "../../../../extensions.js";
import { extensionName } from './config.js';
import { saveSettingsDebounced } from "../../../../../script.js";
import { getRequestHeaders } from './utils.js';

// IndexedDB 配置
const CONFIG_DB_NAME = 'chatu8_config_images';
const CONFIG_DB_VERSION = 1;
const CONFIG_STORE_NAME = 'config_images';

let configDb = null;

// ===================== 辅助函数 =====================

/**
 * 生成 UUID
 */
function generateUUID() {
    if (crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 生成配置图片的 ID 前缀
 * 格式：cfgimg_<uuid>
 */
function generateConfigImageId() {
    return `cfgimg_${generateUUID()}`;
}

/**
 * Base64 转 ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * ArrayBuffer 转 Base64
 */
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Blob 转 Base64
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ===================== IndexedDB 操作 =====================

/**
 * 打开配置图片数据库
 */
async function openConfigDB() {
    if (configDb) {
        return configDb;
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CONFIG_DB_NAME, CONFIG_DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
                db.createObjectStore(CONFIG_STORE_NAME, { keyPath: 'id' });
                console.log(`[ConfigDB] Object store '${CONFIG_STORE_NAME}' created.`);
            }
        };

        request.onerror = (event) => {
            console.error('[ConfigDB] 打开数据库失败:', event.target.error);
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            configDb = event.target.result;
            console.log(`[ConfigDB] 数据库 '${CONFIG_DB_NAME}' 打开成功。`);
            resolve(configDb);
        };
    });
}

/**
 * 写入配置图片到 IndexedDB
 */
async function dbWriteConfigImage(id, imageBuffer) {
    const db = await openConfigDB();
    const transaction = db.transaction([CONFIG_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CONFIG_STORE_NAME);

    return new Promise((resolve, reject) => {
        const request = store.put({ id, data: imageBuffer, date: Date.now() });
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * 从 IndexedDB 读取配置图片
 */
async function dbReadConfigImage(id) {
    const db = await openConfigDB();
    const transaction = db.transaction([CONFIG_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CONFIG_STORE_NAME);

    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * 从 IndexedDB 删除配置图片
 */
async function dbDeleteConfigImage(id) {
    const db = await openConfigDB();
    const transaction = db.transaction([CONFIG_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CONFIG_STORE_NAME);

    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
    });
}

// ===================== 服务器存储操作 =====================

/**
 * 确保服务器存储对象存在
 */
function ensureServerStorage() {
    if (!extension_settings[extensionName].configImageStorage) {
        extension_settings[extensionName].configImageStorage = {};
    }
    return extension_settings[extensionName].configImageStorage;
}

// ===================== 公开 API =====================

/**
 * 保存配置图片
 * 
 * @param {string} imageBase64 - 图片的 Base64 字符串（可带或不带 data:image 前缀）
 * @param {Object} [options] - 可选参数
 * @param {string} [options.format='png'] - 图片格式
 * @param {string} [options.filename] - 文件名
 * @returns {Promise<string>} - 返回图片的唯一标识符 (ID)
 */
export async function saveConfigImage(imageBase64, options = {}) {
    const { format = 'png', filename } = options;
    const id = generateConfigImageId();
    const base64Data = imageBase64.split(',')[1] || imageBase64;

    if (extension_settings[extensionName].jiuguanchucun === "true") {
        // 存储到服务器
        try {
            const uploadBody = {
                image: base64Data,
                format: format,
                ch_name: 'chatu8_config'
            };
            if (filename) {
                uploadBody.filename = filename;
            }

            const response = await fetch('/api/images/upload', {
                method: 'POST',
                headers: getRequestHeaders(window.token),
                body: JSON.stringify(uploadBody)
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            const imagePath = result.path;

            // 存储元数据到 extension_settings
            const storage = ensureServerStorage();
            storage[id] = {
                path: imagePath,
                date: Date.now()
            };

            saveSettingsDebounced();
            console.log(`[ConfigDB] 配置图片已保存到服务器: ${id}`);
            return id;

        } catch (error) {
            console.error('[ConfigDB] 上传配置图片到服务器失败:', error);
            throw error;
        }

    } else {
        // 存储到 IndexedDB
        const imageBuffer = base64ToArrayBuffer(base64Data);
        await dbWriteConfigImage(id, imageBuffer);
        console.log(`[ConfigDB] 配置图片已保存到 IndexedDB: ${id}`);
        return id;
    }
}

/**
 * 获取配置图片
 * 
 * @param {string} id - 图片的唯一标识符
 * @returns {Promise<string|null>} - 返回 Base64 图片字符串，或 null（如果不存在）
 */
export async function getConfigImage(id) {
    if (!id) return null;

    // 先检查服务器存储
    const serverStorage = extension_settings[extensionName].configImageStorage || {};
    const serverEntry = serverStorage[id];

    if (serverEntry && serverEntry.path) {
        try {
            const response = await fetch(serverEntry.path);
            if (response.ok) {
                const blob = await response.blob();
                const base64 = await blobToBase64(blob);
                return base64;
            }
        } catch (error) {
            console.error('[ConfigDB] 从服务器获取配置图片失败:', error);
        }
    }

    // 回退到 IndexedDB
    try {
        const dbEntry = await dbReadConfigImage(id);
        if (dbEntry && dbEntry.data) {
            return "data:image/png;base64," + arrayBufferToBase64(dbEntry.data);
        }
    } catch (error) {
        console.error('[ConfigDB] 从 IndexedDB 获取配置图片失败:', error);
    }

    return null;
}

/**
 * 删除配置图片
 * 
 * @param {string} id - 图片的唯一标识符
 * @returns {Promise<boolean>} - 返回是否删除成功
 */
export async function deleteConfigImage(id) {
    if (!id) return false;

    let deleted = false;

    // 检查并删除服务器存储
    const serverStorage = extension_settings[extensionName].configImageStorage || {};
    const serverEntry = serverStorage[id];

    if (serverEntry) {
        if (serverEntry.path) {
            try {
                const response = await fetch('/api/images/delete', {
                    method: 'POST',
                    headers: getRequestHeaders(window.token),
                    body: JSON.stringify({ path: serverEntry.path })
                });
                if (!response.ok) {
                    console.error('[ConfigDB] 删除服务器图片失败:', response.statusText);
                }
            } catch (error) {
                console.error('[ConfigDB] 删除服务器图片失败:', error);
            }
        }
        delete serverStorage[id];
        saveSettingsDebounced();
        deleted = true;
        console.log(`[ConfigDB] 配置图片已从服务器删除: ${id}`);
    }

    // 检查并删除 IndexedDB 存储
    try {
        const dbEntry = await dbReadConfigImage(id);
        if (dbEntry) {
            await dbDeleteConfigImage(id);
            deleted = true;
            console.log(`[ConfigDB] 配置图片已从 IndexedDB 删除: ${id}`);
        }
    } catch (error) {
        console.error('[ConfigDB] 从 IndexedDB 删除配置图片失败:', error);
    }

    return deleted;
}

/**
 * 检查配置图片是否存在
 * 
 * @param {string} id - 图片的唯一标识符
 * @returns {Promise<boolean>} - 返回图片是否存在
 */
export async function hasConfigImage(id) {
    if (!id) return false;

    // 检查服务器存储
    const serverStorage = extension_settings[extensionName].configImageStorage || {};
    if (serverStorage[id]) {
        return true;
    }

    // 检查 IndexedDB
    try {
        const dbEntry = await dbReadConfigImage(id);
        return !!dbEntry;
    } catch (error) {
        return false;
    }
}

/**
 * 获取所有配置图片的 ID 列表
 * 
 * @returns {Promise<string[]>} - 返回所有配置图片的 ID 数组
 */
export async function listConfigImageIds() {
    const ids = new Set();

    // 获取服务器存储的 ID
    const serverStorage = extension_settings[extensionName].configImageStorage || {};
    Object.keys(serverStorage).forEach(id => ids.add(id));

    // 获取 IndexedDB 的 ID
    try {
        const db = await openConfigDB();
        const transaction = db.transaction([CONFIG_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CONFIG_STORE_NAME);

        const dbIds = await new Promise((resolve, reject) => {
            const request = store.getAllKeys();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });

        dbIds.forEach(id => ids.add(id));
    } catch (error) {
        console.error('[ConfigDB] 获取 IndexedDB ID 列表失败:', error);
    }

    return Array.from(ids);
}
