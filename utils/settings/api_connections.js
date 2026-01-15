// @ts-nocheck
import { extension_settings } from "../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../script.js";
import { extensionName } from '../config.js';
import { removeTrailingSlash, getRequestHeaders, getsdAuth, addLog } from '../utils.js';
import { isValidUrl, showToast } from '../ui_common.js';
// import { fetchModels } from '../ai.js';

/**
 * Populates a select dropdown with options.
 * @param {HTMLSelectElement} selectElement - The select element to populate.
 * @param {Array<{value: string, text: string}>} options - The options to add.
 * @param {string} [selectedValue] - The value to pre-select.
 */
function populateSelect(selectElement, options, selectedValue) {
    if (!selectElement) return;
    const currentValue = selectElement.value;
    selectElement.innerHTML = '';
    options.forEach(option => {
        const opt = new Option(option.text, option.value);
        opt.title = option.text;
        selectElement.add(opt);
    });

    // Try to reselect the previous value, or the provided selectedValue, or the first option
    if (options.some(o => o.value === currentValue)) {
        selectElement.value = currentValue;
    } else if (selectedValue && options.some(o => o.value === selectedValue)) {
        selectElement.value = selectedValue;
    } else if (selectElement.options.length > 0) {
        selectElement.selectedIndex = 0;
    }
}

// async function refreshAiModels() {
//     const button = document.getElementById('ai_model_refresh');
//     const icon = button.querySelector('i');
//     const originalIconClass = icon.className;
//     const modelSelect = document.getElementById('ai_model');

//     icon.className = 'fa-solid fa-sync fa-spin';
//     button.disabled = true;

//     try {
//         const models = await fetchModels();

//         const formattedModels = models
//             .filter(model => model.name && model.output_modalities.includes("text"))
//             .map(model => {
//                 let suffix = '';
//                 if (model.tier === 'anonymous') {
//                     suffix = ' -免费';
//                 } else if (model.tier === 'seed') {
//                     suffix = ' -注册';
//                 } else if (model.tier === 'flower') {
//                     suffix = ' -不开放';
//                 }
//                 return {
//                     value: model.name,
//                     text: `${model.name} (${model.description}${suffix})`
//                 };
//             });

//         populateSelect(modelSelect, formattedModels, extension_settings[extensionName].ai_model);

//         extension_settings[extensionName].ai_models = formattedModels;
//         saveSettingsDebounced();

//         showToast('模型列表已刷新', 'success');
//         addLog('AI models refreshed successfully.');

//     } catch (error) {
//         showToast(`刷新模型失败: ${error.message}`, 'error');
//         addLog(`Failed to refresh AI models: ${error.message}`);
//     } finally {
//         icon.className = originalIconClass;
//         button.disabled = false;
//     }
// }

async function testComfyui() {
    const settings = extension_settings[extensionName];
    let el = document.getElementById("comfyuiUrl");
    let testurl1 = removeTrailingSlash(el.value);
    let testurl = testurl1 + "/object_info";

    if (!settings.comfyuiCache) {
        settings.comfyuiCache = {};
    }

    try {
        if (settings.client === 'jiuguan') {
            const response = await fetch('/api/sd/comfy/models', {
                method: "POST",
                body: JSON.stringify({ url: testurl1 }),
                headers: getRequestHeaders(window.token),
            });
            if (!response.ok) {
                const errorText = await response.text();
                alert("返回错误可能是你输入网址有误" + errorText);
                addLog(`"测试链接失败网址:${testurl1} 错误详情:"${JSON.stringify(errorText)},请求失败,状态码: ${response.status}`)
                throw new Error(`请求失败,状态码: ${response.status}`);
            }
            const response2 = await fetch('/api/sd/comfy/samplers', { method: "POST", body: JSON.stringify({ url: testurl1 }), headers: getRequestHeaders(window.token) });
            const response3 = await fetch('/api/sd/comfy/vaes', { method: "POST", body: JSON.stringify({ url: testurl1 }), headers: getRequestHeaders(window.token) });
            const response4 = await fetch('/api/sd/comfy/schedulers', { method: "POST", body: JSON.stringify({ url: testurl1 }), headers: getRequestHeaders(window.token) });

            if (!response2.ok || !response3.ok || !response4.ok) throw new Error('One or more API calls failed');

            alert("连接成功");
            const model = await response.json();
            const samplers = await response2.json();
            const vaes = await response3.json();
            const schedulers = await response4.json();

            settings.comfyuiCache.models = model;
            settings.comfyuiCache.samplers = samplers;
            settings.comfyuiCache.vaes = vaes;
            settings.comfyuiCache.schedulers = schedulers;
            settings.comfyuiCache.loras = [];
            saveSettingsDebounced();

        } else {
            const response = await fetch(testurl);
            if (response.ok) {
                alert("连接成功");
                const responseData = await response.json();
                const loralist = responseData["LoraLoader"]["input"]["required"]["lora_name"][0];
                const ckpts = responseData.CheckpointLoaderSimple.input.required.ckpt_name[0].map(it => ({ value: it, text: it })) || [];
                const unets = responseData.UNETLoader.input.required.unet_name[0].map(it => ({ value: it, text: `UNet: ${it}` })) || [];
                const ggufs = responseData.UnetLoaderGGUF?.input.required.unet_name[0].map(it => ({ value: it, text: `GGUF: ${it}` })) || [];
                const ModelList = [...ckpts, ...unets, ...ggufs];
                const samplerList = responseData["KSampler"]["input"]["required"]["sampler_name"][0];
                const schedulerList = responseData["KSampler"]["input"]["required"]["scheduler"][0];
                const vaeList = responseData["VAELoader"]["input"]["required"]["vae_name"][0];
                const CLIPLoaderList = responseData["CLIPLoader"]["input"]["required"]["clip_name"][0];
                settings.comfyuiCache.loras = loralist;
                settings.comfyuiCache.models = ModelList;
                settings.comfyuiCache.samplers = samplerList;
                settings.comfyuiCache.schedulers = schedulerList;
                settings.comfyuiCache.vaes = vaeList;
                settings.comfyuiCache.CLIPs = CLIPLoaderList;
                settings.comfyuiCache.objectInfo = responseData;  // 缓存完整的节点类型定义

                saveSettingsDebounced();
            } else {
                alert("连接失败，请检查地址是否正确");
            }
        }
        window.loadSilterTavernChatu8Settings();
    } catch (error) {
        alert("请求错误，请检查地址是否正确或网络连接");
        addLog(`"cpmfyui测试链接失败网址:${testurl} ,请求错误，请检查地址是否正确或网络连接"`)
        console.error("连接测试失败:", error);
    }
}

async function testSd() {
    const settings = extension_settings[extensionName];
    const el = document.getElementById("sdUrl");
    const baseUrl = removeTrailingSlash(el.value);
    if (!isValidUrl(baseUrl)) {
        alert("请输入有效的 Stable Diffusion API 地址。");
        return;
    }

    if (!settings.sdCache) {
        settings.sdCache = {};
    }

    if (settings.client == "jiuguan") {
        const endpoints = {
            samplers: "/api/sd/samplers",
            models: "/api/sd/models",
            vaes: "/api/sd/vaes",
            schedulers: "/api/sd/schedulers",
            upscalers: "/api/sd/upscalers"
        };
        try {
            const responses = await Promise.all(Object.values(endpoints).map(endpoint => fetch(endpoint, {
                method: "POST",
                body: JSON.stringify({ url: baseUrl, auth: settings.st_chatu8_sd_auth || "" }),
                headers: getRequestHeaders(window.token),
            })));
            for (const response of responses) {
                if (!response.ok) throw new Error(`API 请求失败: ${response.status} ${response.statusText} for ${response.url}`);
            }
            const [samplers, models, vaes, schedulers, upscalers] = await Promise.all(responses.map(res => res.json()));
            settings.sdCache.samplers = samplers;
            settings.sdCache.models = models.map(x => x.value);
            settings.sdCache.vaes = vaes;
            settings.sdCache.schedulers = schedulers;
            settings.sdCache.upscalers = upscalers;
            settings.sdCache.loras = [];
            saveSettingsDebounced();
            alert("连接成功");
            addLog(`sd测试链接成功网址:${baseUrl}`);
        } catch (error) {
            alert("sd测试链接失败请检查网址或者网络连接" + error);
            addLog(`sd测试链接失败网址:${baseUrl} 错误详情:"${JSON.stringify(error)}`);
        }
    } else {
        const endpoints = {
            samplers: "/sdapi/v1/samplers",
            models: "/sdapi/v1/sd-models",
            vaes: "/sdapi/v1/sd-vae",
            schedulers: "/sdapi/v1/schedulers",
            upscalers: "/sdapi/v1/upscalers",
            latentUpscalers: "/sdapi/v1/latent-upscale-modes",
            loras: "/sdapi/v1/loras"
        };
        try {
            const results = await Promise.allSettled(Object.values(endpoints).map(endpoint => fetch(baseUrl + endpoint, { headers: { "Authorization": getsdAuth() } })));
            const fulfilledResponses = results.map(result => (result.status === 'fulfilled' && result.value.ok) ? result.value : null);

            if (fulfilledResponses.every(r => r === null)) {
                const firstError = results.find(r => r.status === 'rejected')?.reason?.message ||
                    results.find(r => r.status === 'fulfilled' && !r.value.ok)?.value?.statusText ||
                    "未知错误";
                throw new Error(`所有API请求均失败. 第一个错误: ${firstError}`);
            }

            const dataPromises = fulfilledResponses.map(response => response ? response.json() : Promise.resolve(null));
            const [samplers, models, vaes, schedulers, upscalers, latentUpscalers, loras] = await Promise.all(dataPromises);

            let upscalers2 = upscalers ? upscalers.map(x => x.name) : [];
            let latentUpscalers2 = latentUpscalers ? latentUpscalers.map(x => x.name) : [];
            upscalers2.splice(1, 0, ...latentUpscalers2);

            settings.sdCache.samplers = samplers ? samplers.map(x => x.name) : [];
            settings.sdCache.models = models ? models.map(x => x.title) : [];
            settings.sdCache.vaes = vaes ? vaes.map(x => x.model_name) : [];
            settings.sdCache.schedulers = schedulers ? schedulers.map(x => x.name) : [];
            settings.sdCache.upscalers = upscalers2;
            settings.sdCache.loras = loras ? loras.map(x => x.name) : [];

            saveSettingsDebounced();
            alert("连接成功");
        } catch (error) {
            alert("SD连接测试失败，请检查API地址和网络连接。\n错误: " + error.message);
            addLog(`"测试SD链接失败网址:${baseUrl} 错误详情:"${JSON.stringify(error)}`);
        }
    }
    window.loadSilterTavernChatu8Settings();
}

export function initApiConnectionTests(settingsModal) {
    settingsModal.find('#testSd').on('click', testSd);
    settingsModal.find('#testComfyui').on('click', testComfyui);
}
