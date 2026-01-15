// @ts-nocheck
import { extension_settings } from "../../../../extensions.js";
import { extensionName } from './config.js';
import { setItemImg, getItemImg } from './database.js';
import { saveSettingsDebounced, eventSource } from "../../../../../script.js";
import { EventType } from './config.js';
/**
 * A collection of utility functions.
 */

// Constants for skip_cfg_above_sigma (Variety+) calculation
const REFERENCE_PIXEL_COUNT = 1011712;   // 832 * 1216 reference image size
const SIGMA_MAGIC_NUMBER = 19;           // Base sigma multiplier for V3 and V4 models
const SIGMA_MAGIC_NUMBER_V4_5 = 58;      // Base sigma multiplier for V4.5 models


export function isValidUrl(string) {
    // An empty string is considered valid to not show an error initially.
    if (!string || string.trim() === '') return true;
    // This regex allows http/https, localhost, IP addresses, and domain names, with optional port and path.
    const urlRegex = /^(https?:\/\/)?(localhost|([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)*$/;
    return urlRegex.test(string);
}


export function checkSendBuClass() {
    const sendButton = document.getElementById('send_but');
    const stopButton = document.getElementById('mes_stop');
    const isSendHidden = !sendButton || getComputedStyle(sendButton).display === 'none';
    const isStopVisible = stopButton && getComputedStyle(stopButton).display !== 'none';
    return isSendHidden || isStopVisible;
}


// 使用 TextEncoder 和 TextDecoder
function stringToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) =>
        String.fromCodePoint(byte)
    ).join('');
    return btoa(binString);
}
export function getsdAuth() {

    return `Basic ${stringToBase64(extension_settings[extensionName].st_chatu8_sd_auth)}`


}







export async function getSDMode(sdurl) {
    try {
        const url = new URL(sdurl);
        url.pathname = '/sdapi/v1/options';

        const result = await fetch(url, {
            method: 'GET',
            headers: { "Authorization": getsdAuth() },
        });

        if (!result.ok) {
            const errorText = await result.text();
            throw new Error(`获取 SD 选项失败，状态码: ${result.status}, 响应: ${errorText}`);
        }

        /** @type {any} */
        const data = await result.json();
        const model = data['sd_model_checkpoint'];
        addLog(`当前 SD 模型: ${model}`);
        return model;
    } catch (error) {
        addLog(`获取 SD 模型失败: ${error.message}`);
        throw error;
    }
};



export async function setSDMode(sdurl, model) {
    try {
        async function getProgress(sdurl2) {
            const url = new URL(sdurl2);
            url.pathname = '/sdapi/v1/progress';

            const result = await fetch(url, {
                method: 'GET',
                headers: { "Authorization": getsdAuth() },
            });
            return await result.json();
        }

        toastr.info(`正在切换模型...为${model}`);
        addLog(`开始切换 SD 模型为: ${model}`);

        const url = new URL(sdurl);
        url.pathname = '/sdapi/v1/options';

        const options = {
            sd_model_checkpoint: model,
        };

        const result = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(options),
            headers: {
                'Content-Type': 'application/json'
            },
        });

        if (!result.ok) {
            const errorText = await result.text();
            addLog(`切换 SD 模型 API 请求失败。状态码: ${result.status}, 响应: ${errorText}`);
            throw new Error(`SD WebUI returned an error. Status: ${result.status}`);
        }

        const MAX_ATTEMPTS = 10;
        const CHECK_INTERVAL = 2000;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            /** @type {any} */
            const progressState = await getProgress(sdurl);

            const progress = progressState['progress'];
            const jobCount = progressState['state']['job_count'];
            if (progress === 0.0 && jobCount === 0) {
                break;
            }

            console.info(`Waiting for SD WebUI to finish model loading... Progress: ${progress}; Job count: ${jobCount}`);
            await delay(CHECK_INTERVAL);
        }

        toastr.info(`切换模型成功...为${model}`);
        addLog(`SD model switched to: ${model}`);
    } catch (error) {
        addLog(`切换 SD 模型失败: ${error.message}`);
        toastr.error(`切换模型失败: ${error.message}`);
        throw error;
    }
};

/**
 * Delays the current async function by the given amount of milliseconds.
 * @param {number} ms Milliseconds to wait
 * @returns {Promise<void>} Promise that resolves after the given amount of milliseconds
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determines if a value is an object.
 * @param {any} item The item to check.
 * @returns {boolean} True if the item is an object, false otherwise.
 */
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Merges properties of two objects. If the property is an object, it will be merged recursively.
 * @param {object} target The target object
 * @param {object} source The source object
 * @returns {object} Merged object
 */
export function deepMerge(target, source) {
    let output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target))
                    Object.assign(output, { [key]: source[key] });
                else
                    output[key] = deepMerge(target[key], source[key]);
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

/**
 * 处理输入的base64图像，使其符合指定的大分辨率之一
 * @param {string} inputBase64 - 输入的base64字符串
 * @returns {Promise<string>} - 返回处理后的base64字符串
 */
export async function processReferenceImage(inputBase64) {
    addLog('开始处理参考图...');
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = function () {
            // 原始尺寸
            const originalWidth = img.width;
            const originalHeight = img.height;
            const aspectRatio = originalWidth / originalHeight;
            addLog(`参考图原始尺寸: ${originalWidth}x${originalHeight}, 宽高比: ${aspectRatio.toFixed(2)}`);

            // 三个目标分辨率
            const targetSizes = [
                { width: 1024, height: 1536, ratio: 1024 / 1536 },  // 竖图
                { width: 1472, height: 1472, ratio: 1 },             // 方图
                { width: 1536, height: 1024, ratio: 1536 / 1024 }   // 横图
            ];

            // 选择最接近原图宽高比的目标尺寸
            let selectedSize = targetSizes[0];
            let minDiff = Math.abs(aspectRatio - targetSizes[0].ratio);

            for (let i = 1; i < targetSizes.length; i++) {
                const diff = Math.abs(aspectRatio - targetSizes[i].ratio);
                if (diff < minDiff) {
                    minDiff = diff;
                    selectedSize = targetSizes[i];
                }
            }

            //  addLog(`参考图选择的目标尺寸: ${selectedSize.width}x${selectedSize.height}`);

            // 创建canvas进行处理
            const canvas = document.createElement('canvas');
            canvas.width = selectedSize.width;
            canvas.height = selectedSize.height;
            const ctx = canvas.getContext('2d');

            // 高质量缩放
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, selectedSize.width, selectedSize.height);

            addLog(`正在缩放参考图...`);

            let processedBase64;
            if (isMobileDevice()) {
                // 手机端：使用JPEG格式和0.3的质量进行压缩
                processedBase64 = canvas.toDataURL('image/jpeg', 0.3).replace(/^data:image\/jpeg;base64,/, '');
                //  addLog(`参考图处理完成 (移动端)！输出尺寸: ${selectedSize.width}x${selectedSize.height}, 格式: JPEG, 质量: 0.3`);
            } else {
                // 电脑端：不压缩，使用PNG格式
                processedBase64 = canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
                // addLog(`参考图处理完成 (桌面端)！输出尺寸: ${selectedSize.width}x${selectedSize.height}, 格式: PNG`);
            }

            resolve(processedBase64);
        };

        img.onerror = (err) => {
            const errorMessage = err instanceof Error ? err.message : '未知错误';
            addLog(`参考图加载失败: ${errorMessage}`);
            reject(new Error('图片加载失败'));
        };


        let imgSrc = inputBase64;
        if (inputBase64 && !inputBase64.startsWith('data:image')) {
            addLog('输入为原始base64，正在添加Data URL前缀...');
            imgSrc = 'data:image/png;base64,' + inputBase64;
        }
        img.src = imgSrc;
    });
}





export function calculateSkipCfgAboveSigma(width, height, modelName) {
    addLog(`计算 skip_cfg_above_sigma... 宽度: ${width}, 高度: ${height}, 模型: ${modelName}`);
    const magicConstant = modelName?.includes('nai-diffusion-4-5')
        ? SIGMA_MAGIC_NUMBER_V4_5
        : SIGMA_MAGIC_NUMBER;
    addLog(`使用的 magicConstant: ${magicConstant}`);

    const pixelCount = width * height;
    const ratio = pixelCount / REFERENCE_PIXEL_COUNT;
    addLog(`像素: ${pixelCount}, 比例: ${ratio.toFixed(4)}`);

    const result = Math.pow(ratio, 0.5) * magicConstant;
    addLog(`计算结果 skip_cfg_above_sigma: ${result}`);
    return result;
}

// Function to parse the string
export function parsePromptStringWithCoordinates(promptString) {
    addLog(`解析场景构图字符串: ${promptString}`);
    // 创建结果对象
    const result = {
        'Scene Composition': '',
        'Character 1 Prompt': '',
        'Character 1 UC': '',
        'Character 2 Prompt': '',
        'Character 2 UC': '',
        'Character 3 Prompt': '',
        'Character 3 UC': '',
        'Character 4 Prompt': '',
        'Character 4 UC': '',
        'Character 1 centers': '',
        'Character 2 centers': '',
        'Character 3 centers': '',
        'Character 4 centers': '',
        'Character 1 coordinates': {},
        'Character 2 coordinates': {},
        'Character 3 coordinates': {},
        'Character 4 coordinates': {}
    };

    // 提取场景组成
    const sceneMatch = promptString.match(/Scene Composition:([^;]+);/);
    if (sceneMatch) {
        result['Scene Composition'] = sceneMatch[1].trim();
    }

    // 提取角色信息
    for (let i = 1; i <= 4; i++) {
        // 提取角色提示
        const promptMatch = promptString.match(new RegExp(`Character ${i} Prompt:(.*?)(?:\\s*\\|\\s*centers:([^;\\s]+))?\\s*;`));

        if (promptMatch) {
            result[`Character ${i} Prompt`] = promptMatch[1].trim();
            if (promptMatch[2]) {
                result[`Character ${i} centers`] = promptMatch[2].trim();
                result[`Character ${i} coordinates`] = centersToCoordinates(promptMatch[2].trim());
            } else {
                result[`Character ${i} coordinates`] = {
                    // x:  0.5,
                    // y: y2
                }
            }
        }

        // 提取角色UC
        const ucMatch = promptString.match(new RegExp(`Character ${i} UC:([^;]+);`));
        if (ucMatch) {
            result[`Character ${i} UC`] = ucMatch[1].trim();
        }
    }
    addLog(`解析结果: ${JSON.stringify(result, null, 2)}`);
    return result;
}

/**
 * Creates a stylish input prompt.
 * @param {string} message The message to display in the prompt.
 * @returns {Promise<string|false>} A promise that resolves with the input value or false if canceled.
 */
export function stylInput(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 9999;';
        document.body.appendChild(overlay);

        const confirmBox = document.createElement('div');
        confirmBox.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: #fff; padding: 20px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2); z-index: 10000;';
        document.body.appendChild(confirmBox);

        const messageText = document.createElement('p');
        messageText.textContent = message;
        messageText.style.cssText = 'margin-bottom: 20px; color: #333;';
        confirmBox.appendChild(messageText);

        const messageinput = document.createElement('input');
        messageinput.style.cssText = 'margin-bottom: 20px; color: #333; width: 100%; padding: 5px;';
        confirmBox.appendChild(messageinput);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.textAlign = 'right';
        confirmBox.appendChild(buttonContainer);

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.style.cssText = 'margin-right: 10px; padding: 10px 20px; background-color: #6c757d; color: #fff; border: none; border-radius: 5px; cursor: pointer;';
        buttonContainer.appendChild(cancelButton);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = '确定';
        confirmButton.style.cssText = 'padding: 10px 20px; background-color: #007bff; color: #fff; border: none; border-radius: 5px; cursor: pointer;';
        buttonContainer.appendChild(confirmButton);

        cancelButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            document.body.removeChild(confirmBox);
            resolve(false);
        });

        confirmButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            document.body.removeChild(confirmBox);
            resolve(messageinput.value);
        });
    });
}

// 将centers值转换为坐标
function centersToCoordinates(centers) {
    if (!centers) return {};

    // 从centers提取列和行
    const match = centers.match(/([a-e])([1-5])/i);
    if (!match) return {};

    const column = match[1].toLowerCase();
    const row = parseInt(match[2]);

    // 将列字母转换为0到1之间的x坐标
    const columnMap = {
        'a': 0.1,
        'b': 0.3,
        'c': 0.5,
        'd': 0.7,
        'e': 0.9
    };

    // 将行数字转换为0到1之间的y坐标
    const rowMap = {
        1: 0.1,
        2: 0.3,
        3: 0.5,
        4: 0.7,
        5: 0.9
    };

    return {
        x: columnMap[column] || 0.5,
        y: rowMap[row] || 0.5
    };
}

export async function convertImageToBase64(link, imageBlob) {
    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Image = e.target.result;
        setItemImg(link, base64Image);
        // Process the base64 image data here
    };
    reader.readAsDataURL(imageBlob);
}


/**
 * Creates a stylish confirmation dialog.
 * @param {string} message The message to display in the dialog.
 * @returns {Promise<boolean>} A promise that resolves with true if confirmed, false otherwise.
 */
export function stylishConfirm(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 9999;';
        document.body.appendChild(overlay);

        const confirmBox = document.createElement('div');
        confirmBox.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background-color: #fff; padding: 20px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2); z-index: 10000;';
        document.body.appendChild(confirmBox);

        const messageText = document.createElement('p');
        messageText.textContent = message;
        messageText.style.cssText = 'margin-bottom: 20px; color: #333;';
        confirmBox.appendChild(messageText);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.textAlign = 'right';
        confirmBox.appendChild(buttonContainer);

        const cancelButton = document.createElement('button');
        cancelButton.textContent = '取消';
        cancelButton.style.cssText = 'margin-right: 10px; padding: 10px 20px; background-color: #6c757d; color: #fff; border: none; border-radius: 5px; cursor: pointer;';
        buttonContainer.appendChild(cancelButton);

        const confirmButton = document.createElement('button');
        confirmButton.textContent = '确定';
        confirmButton.style.cssText = 'padding: 10px 20px; background-color: #007bff; color: #fff; border: none; border-radius: 5px; cursor: pointer;';
        buttonContainer.appendChild(confirmButton);

        cancelButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            document.body.removeChild(confirmBox);
            resolve(false);
        });

        confirmButton.addEventListener('click', () => {
            document.body.removeChild(overlay);
            document.body.removeChild(confirmBox);
            resolve(true);
        });
    });
}

/**
 * Removes the trailing slash from a string.
 * @param {string} str The input string.
 * @returns {string} The string without a trailing slash.
 */
export function removeTrailingSlash(str) {
    return str.endsWith('/') ? str.slice(0, -1) : str;
}

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param {string} string The input string.
 * @returns {string} The escaped string.
 */
export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pauses execution for a specified number of milliseconds.
 * @param {number} ms The number of milliseconds to sleep.
 * @returns {Promise<void>} A promise that resolves after the specified time.
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 等待生图锁释放(基于事件监听，避免轮询)
 * 修复竞争条件：多个等待者收到事件时，需要再次检查锁状态，确保真正获取到锁才返回
 * @returns {Promise<void>} 当锁可用时解析
 */
export function waitForLock() {
    return new Promise(resolve => {
        const tryAcquire = () => {
            // 再次检查锁是否可用（防止多个等待者同时通过）
            if (window.xiancheng) {
                // 锁可用，移除监听器并返回
                window.removeEventListener('xianchengReleased', tryAcquire);
                resolve();
            }
            // 如果锁不可用（被其他等待者抢先获取），继续等待下一次事件
        };

        // 首先检查锁是否可用
        if (window.xiancheng) {
            resolve();
            return;
        }

        // 监听锁释放事件
        window.addEventListener('xianchengReleased', tryAcquire);
    });
}

/**
 * 释放生图锁并触发事件通知等待者
 * 在释放前会等待配置的 imageGenInterval 间隔时间
 * 确保图片生成之间有排队等待时间
 */
export async function releaseLock() {
    // 从配置读取间隔时间，等待后再释放锁
    const interval = extension_settings[extensionName].imageGenInterval;
    await new Promise(resolve => setTimeout(resolve, interval));

    window.xiancheng = true;
    window.dispatchEvent(new Event('xianchengReleased'));
}

/**
 * 获取生图锁
 */
export function acquireLock() {
    window.xiancheng = false;
}

/**
 * Adds a smooth shake effect to an element.
 * @param {HTMLElement} imgElement The element to shake.
 */
export function addSmoothShakeEffect(imgElement) {
    if (getComputedStyle(imgElement).position === 'static') {
        imgElement.style.position = 'relative';
    }

    const startTime = Date.now();
    const duration = 300; // ms
    const amplitude = 3; // pixels

    function shake() {
        const elapsed = Date.now() - startTime;
        if (elapsed < duration) {
            const offset = amplitude * Math.sin(elapsed / duration * Math.PI * 10);
            imgElement.style.left = `${offset}px`;
            requestAnimationFrame(shake);
        } else {
            imgElement.style.left = '0px';
        }
    }
    requestAnimationFrame(shake);
}

/**
 * Generates a random seed.
 * @returns {number} A random integer.
 */
export function generateRandomSeed() {
    return Math.floor(Math.random() * 10000000000);
}

/**
 * Checks if the user agent string indicates a mobile device.
 * @returns {boolean} True if it's a mobile device, false otherwise.
 */
export function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Concatenates positive prompts.
 * @param {string} text The base text.
 * @param {string} prom The prompt to add.
 * @param {string} AQT The quality modifier prompt.
 * @returns {string} The combined prompt.
 */
export async function zhengmian(fixedPrompt, mainPrompt, fixedPrompt_end, aqt, insertions) {

    fixedPrompt = await stripChineseAnnotations(fixedPrompt);
    mainPrompt = await stripChineseAnnotations(mainPrompt);
    fixedPrompt_end = await stripChineseAnnotations(fixedPrompt_end);
    aqt = await stripChineseAnnotations(aqt);

    addLog(`组合正面提示词 (复杂规则):`);
    addLog(`  - 前置前: ${insertions['前置前']}`);
    addLog(`  - 固定提示词 (前): ${fixedPrompt}`);
    addLog(`  - 前置后: ${insertions['前置后']}`);
    addLog(`  - 主要提示词: ${mainPrompt}`);
    addLog(`  - 后置前: ${insertions['后置前']}`);
    addLog(`  - 固定提示词 (后): ${fixedPrompt_end}`);
    addLog(`  - 后置后: ${insertions['后置后']}`);
    addLog(`  - 质量标签 (AQT): ${aqt}`);
    addLog(`  - 最后置: ${insertions['最后置']}`);

    const parts = [
        insertions['前置前'],
        fixedPrompt,
        insertions['前置后'],
        mainPrompt,
        insertions['后置前'],
        fixedPrompt_end,
        insertions['后置后'],
        aqt,
        insertions['最后置']
    ];

    const finalPrompt = parts.filter(p => p && p.trim()).join(', ');
    addLog(`组合后的正面提示词: ${finalPrompt}`);
    return finalPrompt;
}

/**
 * Concatenates negative prompts.
 * @param {string} text The base negative prompt.
 * @param {string} UCP The user-defined negative prompt.
 * @returns {string} The combined negative prompt.
 */
export async function fumian(text, UCP) {

    text = await stripChineseAnnotations(text);
    addLog(`组合负面提示词:`);
    addLog(`  - 固定负面提示词: ${text}`);
    addLog(`  - UCP 负面提示词: ${UCP}`);
    console.log("textfumian", text);
    let finalNegativePrompt;
    if (text === "") {
        finalNegativePrompt = UCP;
    } else if (UCP === "") {
        finalNegativePrompt = text;
    } else {
        finalNegativePrompt = UCP + ", " + text;
    }
    addLog(`组合后的负面提示词: ${finalNegativePrompt}`);
    return finalNegativePrompt;
}



/**
 * Parses complex prompt replacement rules and applies them.
 * @param {string} originalPrompt The initial prompt to be transformed.
 * @returns {Promise<{modifiedPrompt: string, insertions: object}>}
 */
export async function prompt_replace(originalPrompt, other_prompt = "") {
    const prompt_replace_id = extension_settings[extensionName].prompt_replace_id;
    const prompt_replace_texts = extension_settings[extensionName].prompt_replace;
    // Use optional chaining and nullish coalescing for safety
    const rulesText = prompt_replace_texts?.[prompt_replace_id]?.text ?? '';

    addLog(`原始 Prompt (用于替换): ${originalPrompt}`);

    if (rulesText.trim() === "") {
        addLog(`无有效替换规则，返回原始 Prompt。`);
        return {
            modifiedPrompt: originalPrompt,
            insertions: { '前置前': '', '前置后': '', '后置前': '', '后置后': '', '最后置': '' }
        };
    }

    addLog(`使用的替换规则内容:\n${rulesText}`);

    const insertions = { '前置前': [], '前置后': [], '后置前': [], '后置后': [], '最后置': [] };
    let modifiedPrompt = originalPrompt;
    let allPrompts = originalPrompt + other_prompt;

    const rules = rulesText.split('\n');

    for (const line of rules) {
        if (line.trim() === '') continue;
        const parts = line.split('=');
        if (parts.length < 2) continue;

        const trigger = parts[0].trim();
        if (!trigger) continue;

        const ruleContent = parts.slice(1).join('=');
        // The rule must contain a pipe to separate type and value
        if (!ruleContent.includes('|')) continue;

        const pipeIndex = ruleContent.indexOf('|');
        const type = ruleContent.substring(0, pipeIndex).trim();
        const value = ruleContent.substring(pipeIndex + 1).trim();

        if (allPrompts.includes(trigger)) {
            if (type === '替换') {
                addLog(`Prompt 替换: "${trigger}" -> "${value}"`);
                modifiedPrompt = modifiedPrompt.replaceAll(trigger, value);
            } else if (insertions.hasOwnProperty(type)) {
                addLog(`发现插入: 类型="${type}", 触发词="${trigger}", 内容="${value}"`);
                insertions[type].push(value);
            }
        }
    }

    const finalInsertions = {};
    for (const key in insertions) {
        finalInsertions[key] = insertions[key].join(', ');
    }


    addLog(`替换/删除后的 Prompt: ${modifiedPrompt}`);
    addLog(`解析出的插入内容: ${JSON.stringify(finalInsertions)}`);

    return { modifiedPrompt, insertions: finalInsertions };

}

/**
 * Applies specific replacement rules for character prompts in multi-character mode.
 * @param {string} originalPrompt The initial character prompt.
 * @returns {Promise<string>} The modified character prompt.
 */
export function prompt_replace_for_character(originalPrompt) {
    const prompt_replace_id = extension_settings[extensionName].prompt_replace_id;
    const prompt_replace_texts = extension_settings[extensionName].prompt_replace;
    // Use optional chaining and nullish coalescing for safety
    const rulesText = prompt_replace_texts?.[prompt_replace_id]?.text ?? '';

    addLog(`原始角色 Prompt (用于分角色替换): ${originalPrompt}`);

    if (rulesText.trim() === "" || !originalPrompt) {
        addLog(`无有效替换规则或空Prompt，返回原始Prompt。`);
        return originalPrompt;
    }

    addLog(`使用的替换规则内容 (分角色):\n${rulesText}`);

    let modifiedPrompt = originalPrompt;

    const rules = rulesText.split('\n');

    for (const line of rules) {
        if (line.trim() === '') continue;
        const parts = line.split('=');
        if (parts.length < 2) continue;

        const trigger = parts[0].trim();
        if (!trigger) continue;

        const ruleContent = parts.slice(1).join('=');
        // The rule must contain a pipe to separate type and value
        if (!ruleContent.includes('|')) continue;

        const pipeIndex = ruleContent.indexOf('|');
        const type = ruleContent.substring(0, pipeIndex).trim();
        const value = ruleContent.substring(pipeIndex + 1);

        if ((type === '替换分角色' || type === '替换') && modifiedPrompt.includes(trigger)) {
            addLog(`分角色 Prompt 替换: "${trigger}" -> "${value}"`);
            modifiedPrompt = modifiedPrompt.replaceAll(trigger, value);
        }
    }

    addLog(`分角色替换后的 Prompt: ${modifiedPrompt}`);
    return modifiedPrompt;
}

/**
 * Generates a unique ID.
 * @returns {string} A unique ID string.
 */
export function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Extracts a prompt from a string between start and end markers.
 * @param {string} str The input string.
 * @param {string} start The start marker (unused in current implementation).
 * @param {string} end The end marker (unused in current implementation).
 * @returns {string} The extracted prompt.
 */
export function extractPrompt(str, start, end) {
    return str;
}

/**
 * A wrapper around the fetch API to mimic GM_xmlhttpRequest.
 * @param {object} options The request options.
 * @returns {Promise<Response>} A promise that resolves with the response.
 */
export function request(options) {
    const { method, url, headers, data, responseType } = options;

    const fetchOptions = {
        method: method || 'GET',
        headers: headers,
        body: data,
    };
    // For pure JS, we might need to handle CORS.
    // fetchOptions.mode = 'cors';

    return fetch(url, fetchOptions).then(async response => {
        let responseData;
        switch (responseType) {
            case 'json':
                responseData = await response.json();
                break;
            case 'arraybuffer':
                responseData = await response.arrayBuffer();
                break;
            case 'blob':
                responseData = await response.blob();
                break;
            default:
                responseData = await response.text();
        }

        return {
            status: response.status,
            statusText: response.statusText,
            response: responseData,
            responseText: typeof responseData === 'string' ? responseData : JSON.stringify(responseData),
        };
    });
}


export function getRequestHeaders(token) {
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
    };
}

/**
 * Adds a message to the log.
 * @param {string} message The message to log.
 */
export function addLog(message) {
    if (!extension_settings[extensionName].log) {
        extension_settings[extensionName].log = '';
    }
    const timestamp = new Date().toLocaleString();
    const logEntry = `[${timestamp}] ${message}\n`;
    extension_settings[extensionName].log += logEntry; // Append new logs

    const logTextarea = document.getElementById('ch-log-textarea');
    if (logTextarea) {
        logTextarea.value = getLog();
        logTextarea.scrollTop = logTextarea.scrollHeight;
    }
}

/**
 * Clears the entire log.
 */
export function clearLog() {
    extension_settings[extensionName].log = '';
}

/**
 * Retrieves the current log content.
 * @returns {string} The log content.
 */
export function getLog() {
    return extension_settings[extensionName].log || '';
}


/**
 * Processes an uploaded image file and returns a base64 data URL.
 * On mobile, it compresses the image to JPEG with 0.3 quality.
 * @param {File} file The image file to process.
 * @returns {Promise<string>} A promise that resolves with the base64 data URL.
 */
export async function processUploadedImage(file, is = false) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (isMobileDevice() && !is) {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.3);
                    addLog(`图片已在移动端压缩 (JPEG 质量 0.3).`);
                    resolve(dataUrl);
                };
                img.onerror = (err) => reject(new Error('图片加载失败.'));
                img.src = e.target.result;
            } else {
                addLog(`桌面端图片已加载.`);
                resolve(e.target.result);
            }
        };
        reader.onerror = (err) => reject(new Error('文件读取失败.'));
        reader.readAsDataURL(file);
    });
}

/**
 * Processes an uploaded image file into a Blob.
 * On mobile, it compresses the image to a JPEG Blob with 0.3 quality.
 * @param {File} file The image file to process.
 * @returns {Promise<Blob>} A promise that resolves with the processed image blob.
 */
export async function processUploadedImageToBlob(file) {
    if (isMobileDevice()) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                addLog(`图片已在移动端压缩 (JPEG 质量 0.5). 原始大小: ${file.size} bytes, 压缩后大小: ${blob.size} bytes`);
                                resolve(blob);
                            } else {
                                reject(new Error('Canvas to Blob 转换失败.'));
                            }
                        },
                        'image/jpeg',
                        0.5
                    );
                };
                img.onerror = (err) => reject(new Error('图片加载失败.'));
                img.src = e.target.result;
            };
            reader.onerror = (err) => reject(new Error('文件读取失败.'));
            reader.readAsDataURL(file);
        });
    } else {
        addLog(`桌面端图片已加载. 大小: ${file.size} bytes`);
        return Promise.resolve(file); // On desktop, return original file
    }
}
/**
 * 移除文本中的 <thinking>...</thinking> 标签及其内容
 * 用于在解析 AI 返回内容前先清理掉思考过程
 * @param {string} text - 输入文本
 * @returns {string} 移除 thinking 标签后的文本
 */
export function removeThinkingTags(text) {
    if (!text || typeof text !== 'string') return text || '';
    // 使用正则匹配 <thinking>...</thinking> 标签及其内容（支持多行和大小写）
    return text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

export function stripChineseAnnotations(text) {
    if (!text) return '';
    // 移除所有中文全角括号及其中内容（支持嵌套括号）
    // 使用循环从最内层括号开始逐层移除
    let result = text;
    let prevResult;
    do {
        prevResult = result;
        // 匹配不包含括号的最内层内容并移除
        result = result.replace(/（[^（）]*）/g, '');
    } while (result !== prevResult);
    return result;
}
