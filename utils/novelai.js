// @ts-nocheck
import {
    sleep,
    generateRandomSeed,
    zhengmian,
    fumian,
    prompt_replace,
    prompt_replace_for_character,
    parsePromptStringWithCoordinates,
    getRequestHeaders,
    calculateSkipCfgAboveSigma,
    processReferenceImage,
    addLog,
    clearLog,
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


function decryptNovelAI(encryptedString) {
    // It might not be an encrypted string, check for the separator
    if (!encryptedString || typeof encryptedString !== 'string' || !encryptedString.includes(':')) {
        return encryptedString;
    }

    try {
        const keyHex = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
        const key = CryptoJS.enc.Hex.parse(keyHex);

        const parts = encryptedString.split(':');
        if (parts.length !== 2) {
            return encryptedString;
        }

        const iv = CryptoJS.enc.Hex.parse(parts[0]);
        const encryptedData = parts[1];

        const cipherParams = CryptoJS.lib.CipherParams.create({
            ciphertext: CryptoJS.enc.Hex.parse(encryptedData)
        });

        const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
            iv: iv,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
        if (decryptedString) {
            return decryptedString;
        } else {
            console.error("NovelAI credential decryption failed. The key might be wrong or the data corrupted. Using raw value.");
            return encryptedString;
        }
    } catch (e) {
        console.error("An error occurred during decryption:", e);
        return encryptedString; // Fallback to original string
    }
}


function unzipFile(arrayBuffer) {
    addLog("开始解压 ZIP 文件...");
    return new Promise((resolve, reject) => {
        JSZip.loadAsync(arrayBuffer)
            .then(function (zip) {
                addLog("ZIP 文件加载成功");

                // 遍历 ZIP 文件中的所有文件
                zip.forEach(function (relativePath, zipEntry) {
                    addLog(`在 ZIP 中找到文件: ${zipEntry.name}`);

                    zipEntry.async('base64').then(function (base64String) {
                        addLog(`文件 ${zipEntry.name} 解压为 Base64，大小: ${base64String.length}`);
                        resolve(base64String);
                    }).catch(err => {
                        addLog(`解压文件 ${zipEntry.name} 失败: ${err.message}`);
                        reject(err);
                    });
                });
            }).catch(err => {
                addLog(`加载 ZIP 文件失败: ${err.message}`);
                reject(err);
            });
    });
}

function _parseMsgpackMessage(messageData) {
    try {
        const unpacked = MessagePack.decode(messageData);
        if (unpacked && unpacked.event_type) {
            addLog(`解析 Msgpack 消息成功: 事件类型 - ${unpacked.event_type}`);
            return { eventType: unpacked.event_type, imageData: unpacked.image };
        }
    } catch (error) {
        addLog(`解析 Msgpack 消息失败: ${error.message}`);
        console.error("解析Msgpack消息失败:", error);
    }
    return null;
}

function _parseMsgpackEvents(msgpack_data) {
    addLog("开始解析 Msgpack 事件流...");
    let offset = 0;
    const events = [];
    while (offset < msgpack_data.length) {
        try {
            const lengthBytes = msgpack_data.slice(offset, offset + 4);
            const messageLength = new DataView(lengthBytes.buffer).getUint32(0);
            const msgStart = offset + 4;
            const msgEnd = msgStart + messageLength;
            addLog(`发现 Msgpack 消息: 长度 ${messageLength}, 范围 ${msgStart}-${msgEnd}`);
            const messageData = msgpack_data.slice(msgStart, msgEnd);
            const event = _parseMsgpackMessage(messageData);
            if (event) events.push(event);
            offset = msgEnd;
        } catch (error) {
            addLog(`解析 Msgpack 事件失败: ${error.message}`);
            console.error("解析Msgpack事件失败:", error);
            offset++; // 尝试跳过一个字节以继续
        }
    }
    addLog(`Msgpack 事件流解析完成，共找到 ${events.length} 个事件。`);
    return events;
}

function uint8ArrayToBase64(uint8Array) {
    // 创建一个字符数组，用于存储 Base64 字符
    let binary = '';
    const len = uint8Array.byteLength;

    // 将每个字节转换为字符
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    // 使用 btoa() 将二进制字符串转换为 Base64 编码
    return btoa(binary);
}

// 新的、解耦的图像生成函数
async function generateNovelAIImage({ prompt: link, width: Xwidth, height: Xheight, change }) {
    clearLog();
    addLog(`开始 NovelAI 生图流程...客户端为${extension_settings[extensionName].client}`);
    addLog(`请求尺寸: 宽度 - ${Xwidth || '默认'}, 高度 - ${Xheight || '默认'}`);

    console.log("正在处理中文注释...", link);
    let change_ = change;



    link = processCharacterPrompt(link);

    link = await stripChineseAnnotations(link)




    change = processCharacterPrompt(change)

    change = await stripChineseAnnotations(change)

    console.log("正在处理中文注释完成...", link);

    if (extension_settings[extensionName].novelaiApi == '000000') {
        addLog("请填写 NovelAI API Key");
        toastr.error("请填写 NovelAI API Key");
        throw new Error("请填写 NovelAI API Key");
    }

    const promptForGeneration = (change && change.trim() !== '') ? change : link;
    addLog(`用于生成的Tag: ${promptForGeneration}`);

    let Divide_roles = false;
    if (promptForGeneration.includes("Scene Composition") && (extension_settings[extensionName].novelaimode == "nai-diffusion-4-curated-preview" || extension_settings[extensionName].novelaimode == "nai-diffusion-4-full" || extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-full" || extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-curated")) {
        Divide_roles = true;
    }
    addLog(`是否启用分角色模式 (Divide_roles): ${Divide_roles}`);


    let access_token = extension_settings[extensionName].novelaiApi;

    let aqt = "";
    if (extension_settings[extensionName].AQT_novelai != '' && extension_settings[extensionName].novelaimode == "nai-diffusion-4-curated-preview") {
        aqt = "rating:general, best quality, very aesthetic, absurdres";
    } else if (extension_settings[extensionName].AQT_novelai != '' && extension_settings[extensionName].novelaimode == "nai-diffusion-4-full") {
        aqt = "no text, best quality, very aesthetic, absurdres";
    } else if (extension_settings[extensionName].AQT_novelai != '' && extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-full") {
        aqt = "very aesthetic, masterpiece, no text";
    } else if (extension_settings[extensionName].AQT_novelai != '' && extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-curated") {
        aqt = "very aesthetic, masterpiece, no text, -0.8::feet::, rating:general";
    } else if (extension_settings[extensionName].AQT_novelai != '' && extension_settings[extensionName].novelaimode == "nai-diffusion-3") {
        aqt = "best quality, amazing quality, very aesthetic, absurdres";
    }
    addLog(`AQT (质量标签) 设置: ${aqt || '无'}`);

    let prompt = "";
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

    if (Divide_roles && extension_settings[extensionName].client == "jiuguan") {
        for (let i = 1; i <= 4; i++) {
            if (prompt_data[`Character ${i} Prompt`]) {

                modifiedPrompt = modifiedPrompt + " | " + prompt_replace_for_character(prompt_data[`Character ${i} Prompt`])

            }
        }

    }

    // 使用新的 zhengmian 函数组合所有部分
    prompt = await zhengmian(
        extension_settings[extensionName].yushe[extension_settings[extensionName].yusheid_novelai].fixedPrompt,
        modifiedPrompt,
        extension_settings[extensionName].yushe[extension_settings[extensionName].yusheid_novelai].fixedPrompt_end,
        aqt,
        insertions
    );

    if (extension_settings[extensionName].addFurryDataset == "true") {
        prompt = "fur dataset, " + prompt;
        addLog("添加了 'fur dataset' 到提示词。");
    }

    // ... (UCP_novelai logic remains the same)
    let UCP_novelai = "";
    addLog(`正在根据模型 (${extension_settings[extensionName].novelaimode}) 和 UCP 预设 (${extension_settings[extensionName].UCP_novelai}) 选择负面提示词...`);

    if (extension_settings[extensionName].novelaimode == "nai-diffusion-3" && extension_settings[extensionName].UCP_novelai == 'Heavy') {

        UCP_novelai = "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]"

    }

    if (extension_settings[extensionName].novelaimode == "nai-diffusion-3" && extension_settings[extensionName].UCP_novelai == 'Light') {

        UCP_novelai = "lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing"

    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-3" && extension_settings[extensionName].UCP_novelai == 'Human Focus') {

        UCP_novelai = "lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes"

    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-full" && extension_settings[extensionName].UCP_novelai == 'Human Focus') {


    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-full" && extension_settings[extensionName].UCP_novelai == 'Heavy') {

        UCP_novelai = "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks, white blank page, blank page"

    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-full" && extension_settings[extensionName].UCP_novelai == 'Light') {


        UCP_novelai = "blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, white blank page, blank page"


    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-curated-preview" && extension_settings[extensionName].UCP_novelai == 'Human Focus') {




    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-curated-preview" && extension_settings[extensionName].UCP_novelai == 'Heavy') {

        UCP_novelai = "blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts, white blank page, blank page"


    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-curated-preview" && extension_settings[extensionName].UCP_novelai == 'Light') {

        UCP_novelai = "blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature, white blank page, blank page"

    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-curated" && extension_settings[extensionName].UCP_novelai == 'Human Focus') {

        UCP_novelai = "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page"

    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-curated" && extension_settings[extensionName].UCP_novelai == 'Heavy') {

        UCP_novelai = "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page"

    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-curated" && extension_settings[extensionName].UCP_novelai == 'Light') {

        UCP_novelai = "blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page"


    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-full" && extension_settings[extensionName].UCP_novelai == 'Human Focus') {

        UCP_novelai = "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, @_@, mismatched pupils, glowing eyes, bad anatomy"


    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-full" && extension_settings[extensionName].UCP_novelai == 'Heavy') {

        UCP_novelai = "lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page"

    }
    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-full" && extension_settings[extensionName].UCP_novelai == 'Light') {

        UCP_novelai = "lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page"

    }

    if (extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-full" && extension_settings[extensionName].UCP_novelai == 'Furry Focus') {

        UCP_novelai = "{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic"

    }
    if (!prompt.includes("nsfw")) {
        UCP_novelai = "nsfw, " + UCP_novelai
    }

    let negative_prompt = await fumian(extension_settings[extensionName].yushe[extension_settings[extensionName].yusheid_novelai].negativePrompt, UCP_novelai);
    let use_coords = extension_settings[extensionName].AI_use_coords == "false";

    // ... (preset_data logic remains mostly the same, using link, Xwidth, Xheight)
    let preset_data = {
        "params_version": 3,
        "width": Number(Xwidth ? Xwidth : extension_settings[extensionName].novelai_width),
        "height": Number(Xheight ? Xheight : extension_settings[extensionName].novelai_height),
        "scale": Number(extension_settings[extensionName].nai3Scale), //提示词关联性
        "sampler": extension_settings[extensionName].novelai_sampler, //"k_euler",//使用的采样器   "k_dpm_2"   "k_dpmpp_2m"    "ddim_v3"  "k_dpmpp_2s_ancestral"
        "steps": Number(extension_settings[extensionName].novelai_steps), //生成的步数
        "n_samples": 1,
        "ucPreset": 3, //预设
        "qualityToggle": true,
        "sm": extension_settings[extensionName].sm === "false" ? false : true,
        "sm_dyn": extension_settings[extensionName].dyn === "false" || extension_settings[extensionName].sm === "false" ? false : true,
        "dynamic_thresholding": extension_settings[extensionName].nai3Deceisp === "false" ? false : true,
        "controlnet_strength": 1,
        "legacy": false,
        "legacy_uc": false,
        "add_original_image": true,
        "cfg_rescale": Number(extension_settings[extensionName].cfg_rescale), //关联性调整
        "noise_schedule": extension_settings[extensionName].Schedule,
        "skip_cfg_above_sigma": extension_settings[extensionName].nai3Variety === "false" ? null : 19,
        "legacy_v3_extend": false,
        "stream": "msgpack",
        "seed": extension_settings[extensionName].novelai_seed === "0" || extension_settings[extensionName].novelai_seed === "" || extension_settings[extensionName].novelai_seed === "-1" ? generateRandomSeed() : Number(extension_settings[extensionName].novelai_seed), //生成的种子，下面是固定的负面提示词
        "negative_prompt": negative_prompt,
        "reference_image_multiple": [],
        "reference_information_extracted_multiple": [],
        "reference_strength_multiple": [],
        "use_coords": use_coords
    }


    if (extension_settings[extensionName].novelaimode !== "nai-diffusion-3") {

        if (Divide_roles) {
            for (let i = 1; i <= 4; i++) {
                if (prompt_data[`Character ${i} Prompt`]) {
                    prompt_data[`Character ${i} Prompt`] = await prompt_replace_for_character(prompt_data[`Character ${i} Prompt`]);
                }
            }
            let characterPrompts = [];
            for (let i = 1; i <= 4; i++) {
                if (prompt_data[`Character ${i} Prompt`]) {
                    characterPrompts[i - 1] = { enabled: true, prompt: prompt_data[`Character ${i} Prompt`], center: prompt_data[`Character ${i} coordinates`], uc: prompt_data[`Character ${i} UC`] ? prompt_data[`Character ${i} UC`] : 'one arms,lowres, aliasing, jaggy lines,bad hands,one legs' };
                }
            }
            let v4_negative_prompt = { caption: { base_caption: negative_prompt, char_captions: [] }, legacy_uc: false };
            for (let i = 1; i <= 4; i++) {
                if (prompt_data[`Character ${i} Prompt`]) {
                    v4_negative_prompt.caption.char_captions.push({ char_caption: prompt_data[`Character ${i} UC`] ? prompt_data[`Character ${i} UC`] : 'one arms,lowres, aliasing, jaggy lines,bad hands,one legs', centers: [prompt_data[`Character ${i} coordinates`]] });
                }
            }
            let v4_prompt = { caption: { base_caption: prompt, char_captions: [] }, use_coords: use_coords, use_order: true };
            for (let i = 1; i <= 4; i++) {
                if (prompt_data[`Character ${i} Prompt`]) {
                    v4_prompt.caption.char_captions.push({ char_caption: prompt_data[`Character ${i} Prompt`], centers: [prompt_data[`Character ${i} coordinates`]] });
                }
            }
            preset_data = { ...preset_data, characterPrompts, v4_prompt, v4_negative_prompt, add_original_image: true, skip_cfg_above_sigma: extension_settings[extensionName].nai3Variety === "false" ? null : 19.343056794463642 };
            if (extension_settings[extensionName].nai3Variety != "false" && extension_settings[extensionName].novelaimode == "nai-diffusion-4-full") {
                preset_data["skip_cfg_above_sigma"] = 19;
            }
            if (extension_settings[extensionName].nai3Variety != "false" && ((extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-curated") || (extension_settings[extensionName].novelaimode == "nai-diffusion-4-5-full"))) {
                preset_data["skip_cfg_above_sigma"] = 59.04722600415217;
            }
            preset_data = {
                "autoSmea": false,
                "normalize_reference_strength_multiple": false,
                "inpaintImg2ImgStrength": 1,
                "params_version": 3,
                "width": Number(Xwidth ? Xwidth : extension_settings[extensionName].novelai_width),
                "height": Number(Xheight ? Xheight : extension_settings[extensionName].novelai_height),
                "scale": Number(extension_settings[extensionName].nai3Scale), //提示词关联性
                "sampler": extension_settings[extensionName].novelai_sampler, //"k_euler",//使用的采样器   "k_dpm_2"   "k_dpmpp_2m"    "ddim_v3"  "k_dpmpp_2s_ancestral"
                "steps": Number(extension_settings[extensionName].novelai_steps), //生成的步数
                "n_samples": 1,
                "ucPreset": 3, //预设
                "qualityToggle": true,
                "dynamic_thresholding": false,
                "controlnet_strength": 1,
                "legacy": false,
                "legacy_uc": false,
                "add_original_image": true,
                "cfg_rescale": Number(extension_settings[extensionName].cfg_rescale), //关联性调整
                "noise_schedule": extension_settings[extensionName].Schedule,
                "skip_cfg_above_sigma": extension_settings[extensionName].nai3Variety === "false" ? null : 19.343056794463642,
                "legacy_v3_extend": false,
                "seed": extension_settings[extensionName].novelai_seed === "0" || extension_settings[extensionName].novelai_seed === "" || extension_settings[extensionName].novelai_seed === "-1" ? generateRandomSeed() : Number(extension_settings[extensionName].novelai_seed), //生成的种子，下面是固定的负面提示词
                "negative_prompt": negative_prompt,
                "use_coords": use_coords,
                "stream": "msgpack",
                "characterPrompts": characterPrompts,
                "v4_prompt": v4_prompt,
                "v4_negative_prompt": v4_negative_prompt
            }
        } else {
            preset_data = {
                "autoSmea": false,
                "normalize_reference_strength_multiple": false,
                "inpaintImg2ImgStrength": 1,
                "params_version": 3,
                "width": Number(Xwidth ? Xwidth : extension_settings[extensionName].novelai_width),
                "height": Number(Xheight ? Xheight : extension_settings[extensionName].novelai_height),
                "scale": Number(extension_settings[extensionName].nai3Scale), //提示词关联性
                "sampler": extension_settings[extensionName].novelai_sampler, //"k_euler",//使用的采样器   "k_dpm_2"   "k_dpmpp_2m"    "ddim_v3"  "k_dpmpp_2s_ancestral"
                "steps": Number(extension_settings[extensionName].novelai_steps), //生成的步数
                "n_samples": 1,
                "ucPreset": 3, //预设
                "qualityToggle": false,
                "dynamic_thresholding": false,
                "controlnet_strength": 1,
                "legacy": false,
                "legacy_uc": false,
                "add_original_image": true,
                "cfg_rescale": Number(extension_settings[extensionName].cfg_rescale), //关联性调整
                "noise_schedule": extension_settings[extensionName].Schedule,
                "skip_cfg_above_sigma": extension_settings[extensionName].nai3Variety === "false" ? null : 19.343056794463642,
                "legacy_v3_extend": false,
                "seed": extension_settings[extensionName].novelai_seed === "0" || extension_settings[extensionName].novelai_seed === "" || extension_settings[extensionName].novelai_seed === "-1" ? generateRandomSeed() : Number(extension_settings[extensionName].novelai_seed), //生成的种子，下面是固定的负面提示词
                "negative_prompt": negative_prompt,
                "use_coords": use_coords,
                "characterPrompts": [],
                "stream": "msgpack",
                "v4_prompt": {
                    "caption": {
                        "base_caption": prompt,
                        "char_captions": []
                    },
                    "use_coords": use_coords,
                    "use_order": true
                },
                "v4_negative_prompt": {
                    "caption": {
                        "base_caption": negative_prompt,
                        "char_captions": []
                    },
                    legacy_uc: false
                }
            }
        }

    }
    // ... (rest of preset_data modifications)
    if (extension_settings[extensionName].novelai_sampler == "k_euler_ancestral") {
        preset_data["deliberate_euler_ancestral_bug"] = false;
        preset_data["prefer_brownian"] = true;
    }
    if (extension_settings[extensionName].nai3Variety != "false") {
        preset_data["skip_cfg_above_sigma"] = calculateSkipCfgAboveSigma(preset_data.width, preset_data.height, extension_settings[extensionName].novelaimode)
    }
    if (window.nai3VibeTransferImage != '' && extension_settings[extensionName].nai3VibeTransfer == "true" && extension_settings[extensionName].novelaimode == "nai-diffusion-3") {
        let image = await processReferenceImage(window.nai3VibeTransferImage)
        preset_data.reference_image_multiple.push(image);
        preset_data.reference_information_extracted_multiple.push(Number(extension_settings[extensionName].InformationExtracted));
        preset_data.reference_strength_multiple.push(Number(extension_settings[extensionName].ReferenceStrength));
    }
    if (window.nai3CharRefImage && extension_settings[extensionName].nai3CharRef == "true" && extension_settings[extensionName].novelaimode.includes("nai-diffusion-4-5")) {
        let image = await processReferenceImage(window.nai3CharRefImage)
        preset_data.director_reference_images = [`${image}`];
        preset_data.director_reference_descriptions = [{ "caption": { "base_caption": "character", "char_captions": [] }, "legacy_uc": false }];
        preset_data.director_reference_information_extracted = [1];
        preset_data.director_reference_strength_values = [1];
        if (extension_settings[extensionName].nai3StylePerception == "true") {
            preset_data["director_reference_descriptions"][0]["caption"]["base_caption"] = "character&style";
        }
    }

    const payload = preset_data;
    // ... (loggablePayload logic)
    const loggablePayload = JSON.parse(JSON.stringify(payload));
    if (loggablePayload.reference_image_multiple && loggablePayload.reference_image_multiple.length > 0) {
        loggablePayload.reference_image_multiple = ["...image data truncated..."];
    }
    if (loggablePayload.director_reference_images && loggablePayload.director_reference_images.length > 0) {
        loggablePayload.director_reference_images = ["...image data truncated..."];
    }
    if (extension_settings[extensionName].client != "jiuguan") {
        addLog(`最终生图参数 (payload): ${JSON.stringify(loggablePayload, null, 2)}`);

    }
    // let urlObj = new URL("https://image.novelai.net/ai/generate-image-stream");
    let urlObj = new URL("https://image.novelai.net/ai/generate-image");
    if (extension_settings[extensionName].novelaisite != "官网") {
        if (extension_settings[extensionName].client == "jiuguan") {
            throw new Error("酒馆端不支持自定义站点！");
        }
        let otherSite = extension_settings[extensionName].novelaiOtherSite;
        urlObj = otherSite.includes("generate-image") ? new URL(otherSite) : new URL(`${otherSite}`);
    }

    // The core fetch logic
    try {
        let re = "";
        if (extension_settings[extensionName].client == "jiuguan") {
            // ... tavern client logic
            await waitForLock();
            acquireLock();
            const read = await fetch('/api/secrets/read', {
                method: 'POST',
                headers: getRequestHeaders(window.token),
                body: JSON.stringify({})

            });


            if (read.ok) {

                if (extension_settings[extensionName].novelaiApi_id != "") {

                    const read = await fetch('/api/secrets/delete', {
                        method: 'POST',
                        headers: getRequestHeaders(window.token),
                        body: JSON.stringify({ id: extension_settings[extensionName].novelaiApi_id, key: "api_key_novel" })

                    });
                }

                let id = "";

                const re = await fetch('/api/secrets/write', {
                    method: 'POST',
                    headers: getRequestHeaders(window.token),
                    body: JSON.stringify({ key: "api_key_novel", value: extension_settings[extensionName].novelaiApi, label: "插件设置的api_key_novel" })
                });

                if (!re.ok) {
                    const errorText = await re.text();
                    throw new Error(`Failed to write secret: ${errorText}`);
                }

                const responseText = await re.text();
                try {
                    const novelid = JSON.parse(responseText);
                    if (novelid && novelid.id) {
                        extension_settings[extensionName].novelaiApi_id = novelid.id;
                        saveSettingsDebounced();
                        await fetch('/api/secrets/rotate', {
                            method: 'POST',
                            headers: getRequestHeaders(window.token),
                            body: JSON.stringify({ id: novelid.id, key: "api_key_novel" })
                        });
                    }
                } catch (e) {
                    addLog(`Could not parse JSON from /api/secrets/write. Response was: "${responseText}". Continuing without rotating key.`);
                    console.warn(`Could not parse JSON from /api/secrets/write. Response was: "${responseText}". Continuing without rotating key.`);
                }
            }
            const tavernAIPayload = { prompt: prompt, model: extension_settings[extensionName].novelaimode, sampler: preset_data.sampler, scheduler: preset_data.noise_schedule, steps: preset_data.steps, scale: preset_data.scale, width: preset_data.width, height: preset_data.height, negative_prompt: preset_data.negative_prompt, decrisper: preset_data.dynamic_thresholding, variety_boost: preset_data.skip_cfg_above_sigma, sm: preset_data.sm, sm_dyn: preset_data.sm_dyn, seed: preset_data.seed };


            addLog(`最终生图参数 (payload): ${JSON.stringify(tavernAIPayload, null, 2)}`);

            const result = await fetch('/api/novelai/generate-image', { method: 'POST', headers: getRequestHeaders(window.token), body: JSON.stringify(tavernAIPayload) });
            releaseLock();
            if (!result.ok) {
                const text = await result.text();
                throw new Error(`生成图片失败，详情查看酒馆控制台: ${text}`);
            }
            let data = await result.text();


            try {
                // First, try to parse as JSON, which is the expected format.
                const jsonResponse = JSON.parse(data);
                re = jsonResponse.images[0];
            } catch (e) {
                // If parsing fails, assume the response is the raw base64 data.
                addLog('JSON 解析失败，尝试作为原始 Base64 数据处理。');
                re = data;
            }
        } else {

            let data11 = ""
            let Authorization = "Bearer " + access_token;


            let recaptcha_token = "";


            data11 = { "input": prompt, "model": extension_settings[extensionName].novelaimode, "action": "generate", "parameters": payload, "use_new_shared_trial": true };


            if (recaptcha_token) {


                data11 = { "input": prompt, "model": extension_settings[extensionName].novelaimode, "action": "generate", "parameters": payload, "recaptcha_token": recaptcha_token.token, "use_new_shared_trial": true };


                Authorization = "Bearer " + recaptcha_token.token;
            }


            console.log("data11:", data11);
            await waitForLock();
            acquireLock();

            let response;
            try {
                response = await fetch(urlObj, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": Authorization }, body: JSON.stringify(data11) });
            } catch (networkError) {
                addLog(`请求遇到网络错误: ${networkError.message}。将在1秒后重试...`);
                await sleep(1000);
                try {
                    response = await fetch(urlObj, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": Authorization }, body: JSON.stringify(data11) });
                } catch (finalError) {
                    releaseLock();
                    addLog(`重试失败: ${finalError.message}`);
                    throw finalError;
                }
            }

            releaseLock();
            if (!response.ok) {
                const mess = await response.text();
                let userFriendlyError = `请求失败, 状态码: ${response.status}, 错误信息: ${mess}`;
                // ... error mapping
                switch (response.status) {
                    case 401: userFriendlyError = "API Key 错误或无效，请检查 API Key。"; break;
                    case 402: userFriendlyError = "需要有效订阅才能访问此端点。"; break;
                }
                throw new Error(userFriendlyError);
            }
            const data123 = await response.arrayBuffer();

            // const responseMsgpack = new Uint8Array(data123);
            // const decodedEvents = _parseMsgpackEvents(responseMsgpack);
            // const finalEvent = decodedEvents.find(event => event.eventType == "final");
            // if (finalEvent) {
            //     re = uint8ArrayToBase64(finalEvent.imageData);
            // }

            re = await unzipFile(data123);

        }
        if (!re) {
            throw new Error("未能从API响应中提取图像数据。");
        }
        let imageUrl = "data:image/png;base64," + re;
        addLog("图像已成功获取并格式化为 data URL。");

        // Return the result instead of manipulating DOM
        return { image: imageUrl, change: change_ || '' };

    } catch (error) {
        releaseLock(); // Ensure lock is released on error
        // Re-throw the error to be caught by the event listener
        throw error;
    }
}





async function novelaigenerate(requestData) {

    const { id, prompt, width, height, change } = requestData;
    addLog(`收到生图请求 (ID: ${id}) - Prompt: ${prompt}${change ? ` - Change: ${change}` : ''}`);

    if (change && change.includes('{修图}')) {

        bananaGenerate(requestData)
        return;
    }

    try {
        const { image: imageUrl, change: returnedChange } = await generateNovelAIImage({ prompt, width, height, change });

        try {
            if (extension_settings[extensionName].cache != "0") {
                await setItemImg(prompt, imageUrl, { change: returnedChange });
                addLog(`图像已存入数据库 for prompt: ${prompt}`);
            } else {
                addLog(`缓存设置为不存入数据库`);
            }
        } catch (dbError) {
            const dbErrorMsg = `无法将图像存入缓存数据库 (ID: ${id}): ${dbError.message}`;
            addLog(`警告: ${dbErrorMsg}`);
            console.warn('Could not save image to DB cache:', dbError);
        }

        eventSource.emit(EventType.GENERATE_IMAGE_RESPONSE, {
            id,
            success: true,
            imageData: imageUrl,
            prompt: prompt, // pass back the original prompt
            change: returnedChange,
        });
        addLog(`发送生图成功响应 (ID: ${id})`);

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
        addLog(`发送生图失败响应 (ID: ${id})`);
    }
}

const LEGACY_EVENT_NAMES = [
    'generate-image-request',
    'generate_image_request'
];

function initializeNovelAIListener() {
    eventSource.on(EventType.GENERATE_IMAGE_REQUEST, novelaigenerate);
    // 兼容旧版本的事件名

    LEGACY_EVENT_NAMES.forEach(eventName => {
        eventSource.on(eventName, novelaigenerate);
    });
    addLog("NovelAI 生图事件监听器已初始化。");
}

export async function replaceWithnovelai() {
    if (extension_settings[extensionName].mode == "novelai") {
        if (!window.initializeNovelAIListener) {
            window.initializeNovelAIListener = true;
            initializeNovelAIListener();
        }
        initializeImageProcessing();
    } else {
        if (window.initializeNovelAIListener) {
            eventSource.removeListener(EventType.GENERATE_IMAGE_REQUEST, novelaigenerate)
            LEGACY_EVENT_NAMES.forEach(eventName => {
                eventSource.removeListener(eventName, novelaigenerate);
            });
            window.initializeNovelAIListener = false;
            addLog("NovelAI 生图事件监听器已关闭。");
        }
    }
}
