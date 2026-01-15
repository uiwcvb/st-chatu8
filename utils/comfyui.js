// @ts-nocheck
import {
    sleep,
    generateRandomSeed,
    zhengmian,
    fumian,
    getRequestHeaders,
    prompt_replace,
    addLog,
    clearLog,
    parsePromptStringWithCoordinates,
    prompt_replace_for_character,
    stripChineseAnnotations,
    waitForLock,
    releaseLock,
    acquireLock,
} from './utils.js';
import { extension_settings } from "../../../../extensions.js";
import { extensionName, EventType } from './config.js';
import { setItemImg } from './database.js';
import { saveChatDebounced, saveSettingsDebounced, eventSource } from '../../../../../script.js';
import { initializeImageProcessing } from './iframe.js';

import { processCharacterPrompt } from './characterprompt.js';
import { bananaGenerate } from './banana.js';
import { processSkippedNodes } from './settings/worker.js';

async function replacepro(payload, json) {
    console.log("payload222", payload);

    json = json.replaceAll("\"%seed%\"", Number(payload.seed));
    json = json.replaceAll("\"%steps%\"", Number(payload.steps));
    json = json.replaceAll("\"%cfg_scale%\"", Number(payload.cfg_scale));
    json = json.replaceAll("\"%sampler_name%\"", `${'"' + payload.sampler_name + '"'}`);
    json = json.replaceAll("\"%width%\"", Number(payload.width));
    json = json.replaceAll("\"%height%\"", Number(payload.height));
    json = json.replaceAll("\"%negative_prompt%\"", `${'"' + payload.negative_prompt + '"'}`);
    json = json.replaceAll("\"%prompt%\"", `${'"' + payload.prompt.replaceAll("\"", "\\\"") + '"'}`);
    json = json.replaceAll("\"%MODEL_NAME%\"", `"${payload.MODEL_NAME}"`);
    json = json.replaceAll("\"%c_quanzhong%\"", Number(payload.c_quanzhong));
    json = json.replaceAll("\"%c_idquanzhong%\"", Number(payload.c_idquanzhong));
    json = json.replaceAll("\"%c_xijie%\"", Number(payload.c_xijie));
    json = json.replaceAll("\"%c_fenwei%\"", Number(payload.c_fenwei));
    json = json.replaceAll("\"%comfyuicankaotupian%\"", `${'"' + payload.comfyuicankaotupian + '"'}`);
    json = json.replaceAll("\"%ipa%\"", `${'"' + payload.ipa + '"'}`);
    json = json.replaceAll("\"%scheduler%\"", `${'"' + payload.scheduler + '"'}`);
    json = json.replaceAll("\"%vae%\"", `${'"' + payload.vae + '"'}`);
    json = json.replaceAll("\"%clip%\"", `${'"' + payload.clip + '"'}`);

    console.log(json);
    return json
}

// New function, modeled after generateNovelAIImage
export async function generateComfyUIImage({ prompt: link, width: Xwidth, height: Xheight, change }) {
    clearLog();




    console.log("link", link);



    link = processCharacterPrompt(link);

    link = await stripChineseAnnotations(link)

    let change_ = change;



    change = processCharacterPrompt(change)

    change = await stripChineseAnnotations(change)
    addLog(`开始 ComfyUI 生图流程。客户端为${extension_settings[extensionName].client}`);
    addLog(`请求工作流id - ${extension_settings[extensionName].workerid}`);
    addLog(`请求尺寸: 宽度 - ${Xwidth || '默认'}, 高度 - ${Xheight || '默认'}`);

    if (extension_settings[extensionName].MODEL_NAME.trim() === '连接后选择') {
        addLog('请填写ComfyUI模型。');
        toastr.error('请填写ComfyUI模型。');
        return;
    }

    const url = extension_settings[extensionName].comfyuiUrl.trim();

    const promptForGeneration = (change && change.trim() !== '') ? change : link;
    addLog(`用于生成的Tag: ${promptForGeneration}`);

    let Divide_roles = false;
    if (promptForGeneration.includes("Scene Composition")) {
        Divide_roles = true;
    }
    addLog(`是否启用分角色模式 (Divide_roles): ${Divide_roles}`);

    let prompt_data = {};
    let mainPrompt = "";
    let other_prompt = "";

    if (Divide_roles) {
        addLog("分角色模式: 解析带坐标的提示词字符串。");
        prompt_data = parsePromptStringWithCoordinates(promptForGeneration);
        mainPrompt = prompt_data["Scene Composition"];

        for (let i = 1; i <= 4; i++) {
            if (prompt_data[`Character ${i} Prompt`]) {

                other_prompt = other_prompt + ", " + prompt_data[`Character ${i} Prompt`]

            }
        }
    } else {
        addLog("标准模式: 使用请求中的 prompt。");
        mainPrompt = promptForGeneration;
    }

    // 应用新的复杂提示词替换规则
    let { modifiedPrompt, insertions } = await prompt_replace(mainPrompt, other_prompt);


    if (Divide_roles) {
        for (let i = 1; i <= 4; i++) {
            if (prompt_data[`Character ${i} Prompt`]) {

                modifiedPrompt = modifiedPrompt + " | " + prompt_replace_for_character(prompt_data[`Character ${i} Prompt`])

            }
        }

    }
    // 使用新的 zhengmian 函数组合所有部分
    let prompt = await zhengmian(
        extension_settings[extensionName].yushe[extension_settings[extensionName].yusheid_comfyui].fixedPrompt,
        modifiedPrompt,
        extension_settings[extensionName].yushe[extension_settings[extensionName].yusheid_comfyui].fixedPrompt_end,
        extension_settings[extensionName].AQT_comfyui,
        insertions
    );
    prompt = replaceLoraTags(prompt); //替换lora字符串  处理字符
    function replaceLoraTags(input) {
        const regex = /<lora:([^:]+)(?:\.safetensors)?:([^>]+)(?::1)?>/g;
        return input.replace(regex, (match, filename, value) => {
            if (match.includes('.safetensors')) {
                return match;
            }
            // Lora只有两个参数 一个是 模型强度 一个是 跳过的强度，多出来一个(用户自己输入了)那么就把我们默认加的:1 去掉。
            if (value.includes(':')) {
                return `<lora:${filename}.safetensors:${value}>`;
            }
            return `<lora:${filename}.safetensors:${value}:1>`;
        });
    }
    if (extension_settings[extensionName].worker.includes('全能提示词编辑器')) {
        prompt = prompt.replaceAll('<lora:', '<wlr:');
        prompt = prompt.replaceAll('.safetensors', '');
    }

    console.log("prompt", prompt);
    addLog(`正面提示词: ${prompt}`);
    let negative_prompt = await fumian(extension_settings[extensionName].yushe[extension_settings[extensionName].yusheid_comfyui].negativePrompt, extension_settings[extensionName].UCP_comfyui);
    if (extension_settings[extensionName].worker.includes('全能提示词编辑器')) {
        negative_prompt = negative_prompt.replaceAll('<lora:', '<wlr:');
    } else {
        negative_prompt = replaceLoraTags(negative_prompt);
    }
    addLog(`负面提示词: ${negative_prompt}`);
    prompt = prompt.replaceAll("\n", ",").replace(/,{2,}/g, ',').replaceAll("\\\\", "\\").replaceAll("\\", "\\\\");
    negative_prompt = negative_prompt.replaceAll("\n", ",").replace(/,{2,}/g, ',').replaceAll("\\\\", "\\").replaceAll("\\", "\\\\");

    let payload = {
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "steps": extension_settings[extensionName].comfyui_steps,
        "sampler_name": extension_settings[extensionName].comfyuisamplerName,
        "width": Xwidth ? Xwidth : extension_settings[extensionName].comfyui_width,
        "height": Xheight ? Xheight : extension_settings[extensionName].comfyui_height,
        "cfg_scale": extension_settings[extensionName].cfg_comfyui,
        "seed": extension_settings[extensionName].comfyui_seed === 0 || extension_settings[extensionName].comfyui_seed === "0" || extension_settings[extensionName].comfyui_seed === "" || extension_settings[extensionName].comfyui_seed === -1 || extension_settings[extensionName].comfyui_seed === "-1" ? generateRandomSeed() : extension_settings[extensionName].comfyui_seed,
        "MODEL_NAME": extension_settings[extensionName].MODEL_NAME,
        "c_quanzhong": extension_settings[extensionName].c_quanzhong,
        "c_idquanzhong": extension_settings[extensionName].c_idquanzhong,
        "c_xijie": extension_settings[extensionName].c_xijie,
        "c_fenwei": extension_settings[extensionName].c_fenwei,
        "comfyuicankaotupian": window.comfyuicankaotupian,
        "ipa": extension_settings[extensionName].ipa,
        "scheduler": extension_settings[extensionName].comfyui_scheduler,
        "vae": extension_settings[extensionName].comfyui_vae,
        "clip": extension_settings[extensionName].comfyuiCLIPName,
    };

    const report = `\n--- 生图参数报告 ---\n正面提示词: ${payload.prompt}\n负面提示词: ${payload.negative_prompt}\n模型: ${payload.MODEL_NAME}\n采样器: ${payload.sampler_name}\n步数: ${payload.steps}\nCFG Scale: ${payload.cfg_scale}\n种子: ${payload.seed}\n尺寸: ${payload.width}x${payload.height}\nVAE: ${payload.vae}\nScheduler: ${payload.scheduler}\n--------------------\n`;
    addLog(report);

    //工作流
    const clientId = "533ef3a3-39c0-4e39-9ced-37d290f371f8";

    // 处理跳过的节点 - 在执行前重映射连接（支持类型匹配）
    let workflowToUse = extension_settings[extensionName].worker;
    try {
        const workflowObj = JSON.parse(workflowToUse);
        const skippedCount = Object.values(workflowObj).filter(n => n && n._skip).length;
        if (skippedCount > 0) {
            addLog(`检测到 ${skippedCount} 个跳过的节点，正在处理连接重映射...`);
            // 获取objectInfo用于类型匹配
            const objectInfo = extension_settings[extensionName]?.comfyuiCache?.objectInfo || {};
            const processedWorkflow = processSkippedNodes(workflowObj, objectInfo);
            workflowToUse = JSON.stringify(processedWorkflow);
            addLog(`跳过节点处理完成，已重映射连接${Object.keys(objectInfo).length > 0 ? '（含类型匹配）' : ''}`);
        }
    } catch (e) {
        addLog(`工作流解析失败，跳过节点处理: ${e.message}`);
    }

    payload = await replacepro(payload, workflowToUse);
    payload = `{"client_id":"${clientId}", "prompt":${payload}}`;
    addLog(`发送到 ComfyUI 的最终 payload: ${payload}`);

    await waitForLock();
    acquireLock();

    try {
        let imageUrl;

        if (extension_settings[extensionName].client === 'jiuguan') {
            const response = await fetch('/api/sd/comfy/generate', {
                method: "POST",
                body: JSON.stringify({
                    url: url,
                    prompt: payload,
                }),
                headers: getRequestHeaders(window.token),
            });

            if (!response.ok) {
                const errorText = await response.text();
                addLog(`API 请求失败 (jiuguan client): ${errorText}`);
                throw new Error(`请求失败,状态码: ${response.status}, 详情: ${errorText}`);
            }

            const responseText = await response.text();
            let format, data;

            try {
                // First, try to parse as JSON, which is the expected format.
                const jsonResponse = JSON.parse(responseText);
                format = jsonResponse.format;
                data = jsonResponse.data;
            } catch (e) {
                // If parsing fails, assume the response is the raw base64 data.
                addLog('JSON 解析失败，尝试作为原始 Base64 数据处理。');
                format = 'png'; // Assume png format if not specified
                data = responseText;
            }


            if (!data) {
                addLog('API 响应中没有图片数据 (jiuguan client)。');
                throw new Error('Endpoint did not return image data.');
            }

            addLog('图片生成成功 (jiuguan client)。');
            imageUrl = `data:image/${format};base64,${data}`;

        } else {
            const urlObj = new URL(url + "/prompt");
            const response = await fetch(urlObj, {
                method: "POST",
                body: payload,
                headers: { "Content-Type": "application/json" }
            });

            if (!response.ok) {
                const errorText = await response.text();
                addLog(`API 请求失败 (direct comfyui): ${errorText}`);
                throw new Error(`请求失败,状态码: ${response.status}, 详情: ${errorText}`);
            }

            const r = await response.json();
            let id = r.prompt_id;
            let ii = 0;

            while (true) {
                try {
                    const response2 = await fetch(`${url}/history/${id}`);
                    if (!response2.ok) {
                        addLog(`轮询历史记录时出错: ${response2.status}`);
                        throw new Error(`History request failed: ${response2.status}`);
                    }
                    let re = await response2.json();
                    console.log("response2", re);
                    if (re.hasOwnProperty(id)) {
                        function getImageInfoFromOutputs(outputs) {
                            for (const key in outputs) {
                                const value = outputs[key];
                                // Check for image outputs
                                if (value.images && value.images.length > 0) {
                                    return {
                                        filename: value.images[0].filename,
                                        subfolder: value.images[0].subfolder || '',
                                        isVideo: false,
                                        format: 'image'
                                    };
                                }
                                // Check for video outputs (gifs field with video format)
                                if (value.gifs && value.gifs.length > 0) {
                                    const gif = value.gifs[0];
                                    const isVideo = gif.format && gif.format.startsWith('video/');
                                    return {
                                        filename: gif.filename,
                                        subfolder: gif.subfolder || '',
                                        isVideo: isVideo,
                                        format: gif.format || 'image/gif'
                                    };
                                }
                            }
                            return null;
                        }

                        let imageInfo = getImageInfoFromOutputs(re[id]["outputs"]);
                        if (!imageInfo) {
                            throw new Error("未能从API响应中找到文件名。");
                        }
                        // Store for later reference
                        window._lastMediaInfo = imageInfo;
                        const mediaType = imageInfo.isVideo ? '视频' : '图片';
                        addLog(`${mediaType}生成成功 (direct comfyui)。`);

                        let fileurl = `${url}/view?filename=${imageInfo.filename}&subfolder=${encodeURIComponent(imageInfo.subfolder)}&type=output`;
                        const imageResponse = await fetch(fileurl);
                        if (!imageResponse.ok) {
                            throw new Error(`获取图片失败,状态码: ${imageResponse.status}`);
                        }
                        let blob = await imageResponse.blob();

                        // 修正视频 MIME 类型问题：某些格式如 video/h264-mp4 浏览器不支持
                        // 需要将其转换为标准的 video/mp4 或 video/webm
                        if (imageInfo.isVideo) {
                            let correctedMimeType = 'video/mp4'; // 默认使用 mp4
                            if (imageInfo.format) {
                                if (imageInfo.format.includes('webm')) {
                                    correctedMimeType = 'video/webm';
                                } else if (imageInfo.format.includes('mp4') || imageInfo.format.includes('h264')) {
                                    correctedMimeType = 'video/mp4';
                                }
                            }
                            // 用正确的 MIME 类型重新构造 Blob
                            const arrayBuffer = await blob.arrayBuffer();
                            blob = new Blob([arrayBuffer], { type: correctedMimeType });
                            console.log(`[ComfyUI] 视频 MIME 类型修正: ${imageInfo.format} -> ${correctedMimeType}`);
                        }

                        imageUrl = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(blob);
                        });
                        break; // Exit while loop
                    }
                    await sleep(1000);
                    ii++;

                    if (ii > 200) {
                        addLog('轮询超时，服务器可能已断开连接。');
                        throw new Error("ComfyUI 服务器超时。");
                    }
                } catch (error) {
                    addLog(`轮询时发生异常: ${error}`);
                    throw error; // Re-throw to be caught by outer catch
                }
            }
        }

        releaseLock();
        if (!imageUrl) {
            throw new Error("未能生成图片 URL。");
        }

        // Determine if it's a video based on mediaInfo captured earlier
        const isVideo = window._lastMediaInfo?.isVideo || false;
        const mediaFormat = window._lastMediaInfo?.format || 'image';
        addLog(`媒体 (${isVideo ? '视频' : '图片'}) 已成功获取并格式化为 data URL。`);
        return { image: imageUrl, change: change_ || '', isVideo: isVideo, format: mediaFormat };

    } catch (error) {
        releaseLock(); // Ensure lock is released on error
        addLog(`图片生成过程中发生错误: ${error.message}`);
        console.error('Error generating image:', error);
        // Re-throw the error to be caught by the event listener or caller
        throw error;
    }
}


async function comfyuigenerate(requestData) {
    let { id, prompt, width, height, change } = requestData;
    addLog(`收到生图请求 (ID: ${id}) - Prompt: ${prompt}${change ? ` - Change: ${change}` : ''}`);

    if (change && change.includes('{修图}')) {

        bananaGenerate(requestData)
        return;
    }

    try {

        const { image: imageUrl, change: returnedChange, isVideo, format } = await generateComfyUIImage({ prompt, width, height, change });


        if (extension_settings[extensionName].cache != "0") {
            await setItemImg(prompt, imageUrl, { change: returnedChange, isVideo: isVideo, format: format });
            addLog(`${isVideo ? '视频' : '图像'}已存入数据库 for prompt: ${prompt}`);

        } else {

            addLog(`缓存设置为不存入数据库`);

        }

        eventSource.emit(EventType.GENERATE_IMAGE_RESPONSE, {
            id,
            success: true,
            imageData: imageUrl,
            prompt: prompt, // pass back the original prompt
            change: returnedChange,
            isVideo: isVideo || false,
            format: format || 'image',
        });

        eventSource.emit("generate-image-response", {
            id,
            success: true,
            imageData: imageUrl,
            prompt: prompt, // pass back the original prompt
            change: returnedChange,
            isVideo: isVideo || false,
            format: format || 'image',
        });
        addLog(`发送${isVideo ? '视频' : '图片'}生成成功响应 (ID: ${id})`);

    } catch (error) {
        const errorMsg = `生图流程捕获到异常 (ID: ${id}): ${error.message}`;
        addLog(`错误: ${errorMsg}`);
        console.error('Error generating image:', error);

        eventSource.emit(EventType.GENERATE_IMAGE_RESPONSE, {
            id,
            success: false,
            error: error.message,
            prompt: prompt,
        });
        eventSource.emit("generate-image-response", {
            id,
            success: false,
            error: error.message,
            prompt: prompt,
        });
        addLog(`发送生图失败响应 (ID: ${id})`);
    }
}





// 兼容旧版本的事件名
const LEGACY_EVENT_NAMES = [
    'generate-image-request',
    'generate_image_request'
];

function initializeComfyuiListener() {
    // 监听新版事件
    eventSource.on(EventType.GENERATE_IMAGE_REQUEST, comfyuigenerate);
    // 同时监听旧版事件名（向后兼容）
    LEGACY_EVENT_NAMES.forEach(eventName => {
        eventSource.on(eventName, comfyuigenerate);
    });
    addLog("comfyui 生图事件监听器已初始化（含旧版兼容）。");
}

export async function replaceWithcomfyui() {

    if (extension_settings[extensionName].mode == "comfyui") {
        if (!window.initializeComfyuiListener) {
            window.initializeComfyuiListener = true;
            initializeComfyuiListener();
        }
        initializeImageProcessing();
    } else {
        if (window.initializeComfyuiListener) {
            // 移除新版事件监听
            eventSource.removeListener(EventType.GENERATE_IMAGE_REQUEST, comfyuigenerate);
            // 同时移除旧版事件监听
            LEGACY_EVENT_NAMES.forEach(eventName => {
                eventSource.removeListener(eventName, comfyuigenerate);
            });
            window.initializeComfyuiListener = false;
            addLog("comfyui 生图事件监听器已关闭。");
        }
    }
}
