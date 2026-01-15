// @ts-nocheck
import { extension_settings } from "../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../script.js";
import { defaultSettings, extensionName, extensionFolderPath, defaultThemes, aiModels } from './config.js';
import { storeDelete, storeReadOnly, getAllImageMetadata, getAllImages, deleteMultipleImages, getImageByUUID, deleteImagesByUuids, getImageBlobByUUID, getImageThumbnailBlobByUUID, migrateDatabase, generateMissingThumbnails, syncServerImagesWithStorage, initJiuguanStorage } from './database.js';
import {
    getSuffix,
    size_change,
    hideSettingsPanel,
    applyFabSettings,
    isValidUrl,
    validateUrlInput,
    stylishConfirm
} from './ui_common.js';
import { removeTrailingSlash, getRequestHeaders, getLog, clearLog, addLog, processUploadedImage, processUploadedImageToBlob, getsdAuth } from './utils.js';
// AI 设置已统一到 LLM 设置页面，不再需要单独导入 initAiSettings
import { initPromptReplaceControls } from './settings/prompt_replace.js';
import { initLogSettings, updateLogView } from './settings/log.js';
import { initWorldBookControls, refreshWorldBookSettings, setupWorldBookEventListener } from './settings/worldbook.js';
import { initUpdateCheck } from './settings/update.js';
import { showSettingsPanel } from "./ui_common.js";
import { initWorkerControls, eidtwork } from './settings/worker.js';
import { initThemeSettings, applyTheme, applyImageFrameStyle, isThemeDark } from './settings/theme.js';
import { initPromptSettings } from './settings/prompt.js';
import {
    initImageUpload,
    updateNovelaiImagePreview,
    updateNovelaiCharRefImagePreview,
    updateComfyUIImagePreview,
    nai3VibeTransferImageMimeType,
    nai3CharRefImageMimeType,
    comfyuiImageObjectURL
} from './settings/image_upload.js';
import { initApiConnectionTests } from './settings/api_connections.js';
import { initLoraControls } from './settings/lora.js';
import { initGeneralSettings } from './settings/general.js';
import { initFab } from './settings/fab.js';
import { initImageCache } from './settings/image_cache.js';
import { initNovelaiUI } from './settings/novelai_ui.js';
import { init as initVocabulary } from './settings/vocabulary.js';
import { initCharacterSettings, refreshCharacterSettings } from './settings/character/index.js';
import { initBananaUI } from './settings/bananaui.js';
import { initRegexSettings } from './settings/regex.js';
import { initLLMSettings } from './settings/llm.js';
import { initSendData } from './settings/send_data.js';

// Backend reconcilers
import { replaceWithSd } from './sd.js';
import { replaceWithnovelai } from './novelai.js';
import { replaceWithcomfyui } from './comfyui.js';
import { replaceWithBanana } from './banana.js';
import { initGestureMonitor } from './settings/Drawing.js';
import { initClickTriggerMonitor } from './settings/ClickTrigger.js';

let settings;
let currentPreviewTheme = {};
const generationTabs = ['sd', 'novelai', 'comfyui'];
// 注意: 'worldbook' 已从 tabIds 移除，世界书功能暂时隐藏
const tabIds = ['main', 'sd', 'novelai', 'comfyui', 'banana', 'llm', 'vocabulary', 'character', 'theme', 'fab', 'image-cache', 'regex', 'send_data', 'about', 'log'];

async function loadAllTabsContent(container) {
    if (!container) {
        console.error("Chatu8 UI Error: Tab content container not found.");
        return false;
    }
    try {
        const fetchPromises = tabIds.map(tabId =>
            fetch(`${extensionFolderPath}/html/settings/${tabId}.html`).then(res => {
                if (!res.ok) throw new Error(`Failed to fetch ${tabId}.html`);
                return res.text();
            })
        );

        const htmlContents = await Promise.all(fetchPromises);

        const finalHtml = htmlContents.map((html, index) => {
            const tabId = tabIds[index];
            return `<div id="st-chatu8-tab-${tabId}" class="st-chatu8-tab-content" data-tab-id="${tabId}">${html}</div>`;
        }).join('');

        container.innerHTML = finalHtml;

        // AI/翻译设置已统一到 LLM 设置页面，不再需要单独加载 translate.html

        console.log("Chatu8 UI: All tab contents loaded.");
        return true;
    } catch (error) {
        console.error("Chatu8 UI Error: Could not load all tab contents.", error);
        container.innerHTML = `<p class="error" style="color:red; text-align:center; margin-top: 20px;">错误：无法加载设置页面。请检查浏览器控制台获取详细信息。</p>`;
        return false;
    }
}

function updateGenerationModeHandlers() {

    // These functions will internally check the current mode and
    // add/remove the event listener accordingly.
    replaceWithSd();

    replaceWithnovelai();
    replaceWithcomfyui();
    replaceWithBanana();
    addLog('[UI] Generation mode handlers updated for mode: ' + extension_settings[extensionName].mode);
}

export async function initUI({ check_update }) {
    const existingPanel = document.getElementById('st-chatu8-settings');
    if (existingPanel) {
        existingPanel.remove();
    }
    settings = extension_settings[extensionName];

    // 初始化 jiuguanStorage（从隐写图片加载）
    try {
        await initJiuguanStorage();
    } catch (error) {
        console.error('[UI] 初始化 jiuguanStorage 失败:', error);
    }

    // Apply initial theme is now handled in loadSettingsIntoUI,
    // which is called when the panel is shown.
    // applyTheme(settings.theme_id);

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = `${extensionFolderPath}/style.css`;
    document.head.appendChild(link);


    try {
        const response = await fetch(`${extensionFolderPath}/settings.html`);
        if (!response.ok) throw new Error('Failed to fetch settings.html');
        const settingsHtml = await response.text();
        document.body.insertAdjacentHTML('beforeend', settingsHtml);
    } catch (error) {
        console.error("Chatu8 UI Error: Could not load main settings panel.", error);
        return;
    }

    const tabContentContainer = document.querySelector('#ch-settings-modal .st-chatu8-content');
    if (!await loadAllTabsContent(tabContentContainer)) {
        return;
    }

    function loadSettingsIntoUI() {
        settings = extension_settings[extensionName];

        // Fallback for very first run
        if (!settings.themes) {
            settings.themes = JSON.parse(JSON.stringify(defaultThemes));
        }

        if (!settings.theme_id || !settings.themes[settings.theme_id]) {
            settings.theme_id = '默认-白天';
        }

        applyTheme(settings.themes[settings.theme_id]);

        // Load main settings that are not duplicated
        const mainKeys = ['scriptEnabled', 'newlineFixEnabled', 'mode', 'client', 'displayMode', 'heavyFrontendMode', 'dbclike', 'zidongdianji', 'zidongdianji2', 'longPressToEdit', 'clickToPreview', 'startTag', 'endTag', 'cache', 'sdUrl', 'st_chatu8_sd_auth', 'comfyuiUrl', 'novelaiApi', 'novelaisite', 'novelaiOtherSite', 'novelaimode', 'novelai_sampler', 'Schedule', 'nai3Scale', 'cfg_rescale', 'AI_use_coords', 'sm', 'dyn', 'nai3Variety', 'nai3Deceisp', 'sd_cwidth', 'sd_cheight', 'sd_csteps', 'sd_cseed', 'sdCfgScale', 'restoreFaces', 'novelai_width', 'novelai_height', 'novelai_steps', 'novelai_seed', 'nai3VibeTransfer', 'InformationExtracted', 'ReferenceStrength', 'nai3CharRef', 'nai3StylePerception', 'comfyui_width', 'comfyui_height', 'comfyui_steps', 'comfyui_seed', 'cfg_comfyui', 'worker', 'ipa', 'c_fenwei', 'c_xijie', 'c_quanzhong', 'c_idquanzhong', 'AQT_sd', 'UCP_sd', 'AQT_novelai', 'UCP_novelai', 'AQT_comfyui', 'UCP_comfyui', 'addFurryDataset', 'sd_cupscale_factor', 'sd_chires_fix', 'sd_chires_steps', 'sd_cdenoising_strength', 'sd_cclip_skip', 'sd_cadetailer', 'worldBookEnabled', 'ai_temperature', 'ai_top_p', 'ai_presence_penalty', 'ai_frequency_penalty', 'ai_stream', 'ai_private', 'ai_token', 'vocabulary_search_startswith', 'vocabulary_search_limit', 'vocabulary_search_sort', 'enablePregen', 'imageGenInterval', 'imageAlignment', 'translation_system_prompt', 'ai_test_system', 'ai_test_user', "ai_test_output", "jiuguanchucun"];
        mainKeys.forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = String(settings[key]) === 'true';
                } else {
                    element.value = settings[key];
                }
            }
        });

        // AI settings are now loaded in LLM settings page
        // AI 和翻译模型设置已经移到 LLM 设置页面，不再在此处加载

        // Sync sliders with number inputs for NovelAI Vibe Transfer
        const infoExtracted = document.getElementById('InformationExtracted');
        const infoExtractedRange = document.getElementById('InformationExtracted_range');
        if (infoExtracted && infoExtractedRange) {
            infoExtractedRange.value = infoExtracted.value;
        }
        const refStrength = document.getElementById('ReferenceStrength');
        const refStrengthRange = document.getElementById('ReferenceStrength_range');
        if (refStrength && refStrengthRange) {
            refStrengthRange.value = refStrength.value;
        }

        // Images are now session-only and not loaded from settings.
        // Restore images from memory if they exist
        if (window.nai3VibeTransferImage) {
            updateNovelaiImagePreview(`data:${nai3VibeTransferImageMimeType};base64,${window.nai3VibeTransferImage}`);
        } else {
            updateNovelaiImagePreview(null);
        }
        if (window.nai3CharRefImage) {
            updateNovelaiCharRefImagePreview(`data:${nai3CharRefImageMimeType};base64,${window.nai3CharRefImage}`);
        } else {
            updateNovelaiCharRefImagePreview(null);
        }
        updateComfyUIImagePreview(comfyuiImageObjectURL);

        // Validate URLs on load
        validateUrlInput(document.getElementById('sdUrl'));
        validateUrlInput(document.getElementById('comfyuiUrl'));

        const sdCache = settings.sdCache;
        const hasSdCache = sdCache && sdCache.models && sdCache.models.length > 0;



        const sdSelects = [
            { id: 'sd_cchatu_8_model', cacheKey: 'models', settingKey: 'sd_cchatu_8_model', nameField: 'model_name' },
            { id: 'sd_cchatu_8_vae', cacheKey: 'vaes', settingKey: 'sd_cchatu_8_vae', nameField: 'model_name' },
            { id: 'sd_cchatu_8_samplerName', cacheKey: 'samplers', settingKey: 'sd_cchatu_8_samplerName', nameField: 'name' },
            { id: 'sd_cchatu_8_scheduler', cacheKey: 'schedulers', settingKey: 'sd_cchatu_8_scheduler', nameField: 'name' },
            { id: 'sd_cchatu_8_upscaler', cacheKey: 'upscalers', settingKey: 'sd_cchatu_8_upscaler', nameField: 'name' },
            { id: 'sd_cchatu_8_lora', cacheKey: 'loras', settingKey: 'sd_cchatu_8_lora', nameField: 'name' }
        ];

        if (hasSdCache) {
            sdSelects.forEach(({ id, cacheKey, settingKey, nameField }) => {
                const selectEl = document.getElementById(id);
                if (selectEl) {
                    selectEl.innerHTML = '';
                    selectEl.disabled = false;
                    if (id === 'sd_cchatu_8_vae') {
                        selectEl.add(new Option('NONE', 'NONE'));
                    }
                    if (sdCache[cacheKey]) {
                        sdCache[cacheKey].forEach(item => {
                            const name = item;
                            const option = new Option(name, name);
                            option.title = name;

                            selectEl.add(option);
                        });
                    }
                    selectEl.value = settings[settingKey];
                    if (selectEl.selectedIndex === -1 && selectEl.options.length > 0) {
                        selectEl.selectedIndex = 0;
                        settings[settingKey] = selectEl.value;
                    }
                }
            });
        } else {
            sdSelects.forEach(({ id, settingKey }) => {
                const selectEl = document.getElementById(id);
                if (selectEl) {
                    selectEl.innerHTML = `<option value="${settings[settingKey]}">${settings[settingKey]}</option>`;
                    selectEl.disabled = true;
                }
            });
        }





        // Handle ComfyUI dropdowns, loading from cache if available
        const comfyCache = settings.comfyuiCache;
        const hasCache = comfyCache && comfyCache.models && comfyCache.models.length > 0;

        const modelSelect = document.getElementById('MODEL_NAME');
        const vaeSelect = document.getElementById('comfyui_vae');
        const schedulerSelect = document.getElementById('comfyui_scheduler');
        const samplerSelect = document.getElementById('comfyuisamplerName');
        const loraSelect = document.getElementById('ComfyuiLORA');
        const CLIPSelect = document.getElementById('comfyuiCLIPName');



        if (hasCache) {
            // Populate from cache and enable
            [modelSelect, vaeSelect, schedulerSelect, samplerSelect, loraSelect, CLIPSelect].forEach(el => {
                if (el) {
                    el.innerHTML = '';
                    el.disabled = false;
                }
            });

            comfyCache.models.forEach(model => {
                const optionText = (model.text || model.value);
                const option = new Option(optionText, model.value.replaceAll("\\", "\\\\"));
                option.title = option.text;
                if (modelSelect) modelSelect.add(option);
            });

            comfyCache.vaes.forEach(vaeName => {
                const name = typeof vaeName === 'object' ? vaeName.value : vaeName;
                const option = new Option(name, name);
                option.title = name;
                if (vaeSelect) vaeSelect.add(option);
            });

            comfyCache.schedulers.forEach(schedulerName => {
                const option = new Option(schedulerName, schedulerName);
                option.title = schedulerName;
                if (schedulerSelect) schedulerSelect.add(option);
            });

            comfyCache.samplers.forEach(samplerName => {
                const option = new Option(samplerName, samplerName);
                option.title = samplerName;
                if (samplerSelect) samplerSelect.add(option);
            });

            if (comfyCache.CLIPs) {
                comfyCache.CLIPs.forEach(CLIPName => {
                    const option = new Option(CLIPName, CLIPName);
                    option.title = CLIPName;
                    if (CLIPSelect) CLIPSelect.add(option);
                });
            }

            if (loraSelect && comfyCache.loras && comfyCache.loras.length > 0) {
                comfyCache.loras.forEach(loraName => {
                    const option = new Option(loraName.replace(".safetensors", ""), loraName.replace(".safetensors", ""));
                    option.title = loraName;
                    loraSelect.add(option);
                });
            } else if (loraSelect) {
                loraSelect.innerHTML = '<option>无</option>';
                loraSelect.disabled = true;
            }

            // Set selected values
            if (modelSelect) {
                modelSelect.value = settings.MODEL_NAME;
                if (modelSelect.selectedIndex === -1 && modelSelect.options.length > 0) {
                    modelSelect.selectedIndex = 0;
                    settings.MODEL_NAME = modelSelect.value;
                }
            }
            if (vaeSelect) {
                vaeSelect.value = settings.comfyui_vae;
                if (vaeSelect.selectedIndex === -1 && vaeSelect.options.length > 0) {
                    vaeSelect.selectedIndex = 0;
                    settings.comfyui_vae = vaeSelect.value;
                }
            }
            if (schedulerSelect) {
                schedulerSelect.value = settings.comfyui_scheduler;
                if (schedulerSelect.selectedIndex === -1 && schedulerSelect.options.length > 0) {
                    schedulerSelect.selectedIndex = 0;
                    settings.comfyui_scheduler = schedulerSelect.value;
                }
            }
            if (samplerSelect) {
                samplerSelect.value = settings.comfyuisamplerName;
                if (samplerSelect.selectedIndex === -1 && samplerSelect.options.length > 0) {
                    samplerSelect.selectedIndex = 0;
                    settings.comfyuisamplerName = samplerSelect.value;
                }
            }

            if (CLIPSelect) {
                CLIPSelect.value = settings.comfyuiCLIPName;
                if (CLIPSelect.selectedIndex === -1 && CLIPSelect.options.length > 0) {
                    CLIPSelect.selectedIndex = 0;
                    settings.comfyuiCLIPName = CLIPSelect.value;
                }
            }


        } else {
            // Disable and show placeholder text
            const selects = [
                { el: modelSelect, setting: 'MODEL_NAME' },
                { el: vaeSelect, setting: 'comfyui_vae' },
                { el: schedulerSelect, setting: 'comfyui_scheduler' },
                { el: samplerSelect, setting: 'comfyuisamplerName' },
                { el: CLIPSelect, setting: 'comfyuiCLIPName' }
            ];

            selects.forEach(({ el, setting }) => {
                if (el) {
                    el.innerHTML = '';
                    const option = new Option(settings[setting] || "未连接", settings[setting]);
                    option.title = settings[setting];
                    el.add(option);
                    el.value = settings[setting];
                    el.disabled = true;
                }
            });
            if (loraSelect) {
                loraSelect.innerHTML = '<option>未连接</option>';
                loraSelect.disabled = true;
            }
        }

        // Load settings for each duplicated prompt section
        generationTabs.forEach(mode => {
            const suffix = getSuffix(mode);
            const yusheSelect = document.getElementById('yusheid' + suffix);
            const yusheIdKey = `yusheid${mode === 'sd' ? '_sd' : suffix}`;

            if (yusheSelect) {
                yusheSelect.innerHTML = '';
                for (const key in settings.yushe) {
                    const option = new Option(key, key);
                    option.title = key;
                    yusheSelect.add(option);
                }
                yusheSelect.value = settings[yusheIdKey];
            }

            const currentPresetId = settings[yusheIdKey] || '默认';
            const currentPreset = settings.yushe[currentPresetId] || {};
            const fields = ['fixedPrompt', 'fixedPrompt_end', 'negativePrompt'];
            fields.forEach(field => {
                const textarea = document.getElementById(field + suffix);
                if (textarea) {
                    textarea.value = currentPreset[field] ?? '';
                    const warning = textarea.closest('.st-chatu8-field-col').querySelector('.st-chatu8-unsaved-warning');
                    if (warning) $(warning).hide();
                }
            });
        });

        // Load theme settings
        // initThemeSettings(settings, currentPreviewTheme);

        // Ensure prompt_replace settings exist
        if (!settings.prompt_replace) {
            settings.prompt_replace = { "默认": { "text": '' } };
        }
        if (!settings.prompt_replace_id) {
            settings.prompt_replace_id = "默认";
        }

        // Load settings for each duplicated prompt replace section
        generationTabs.forEach(mode => {
            const suffix = getSuffix(mode);
            const replaceSelect = document.getElementById('prompt_replace_id' + suffix);
            if (replaceSelect) {
                replaceSelect.innerHTML = '';
                for (const key in settings.prompt_replace) {
                    const option = new Option(key, key);
                    option.title = key;
                    replaceSelect.add(option);
                }
                replaceSelect.value = settings.prompt_replace_id;
            }

            const currentPreset = settings.prompt_replace[settings.prompt_replace_id] || {};
            const textarea = document.getElementById('prompt_replace_text' + suffix);
            if (textarea) {
                textarea.value = currentPreset.text ?? '';
                const warning = textarea.closest('.st-chatu8-field-col').querySelector('.st-chatu8-unsaved-warning');
                if (warning) $(warning).hide();
            }
        });

        // Load worker settings
        // Ensure worldBookList settings exist
        if (!settings.worldBookList) {
            settings.worldBookList = { "默认": { "content": "" } };
        }
        if (!settings.worldBookList_id) {
            settings.worldBookList_id = "默认";
        }

        // Load world book settings
        const worldBookSelect = document.getElementById('worldBookList_id');
        if (worldBookSelect) {
            worldBookSelect.innerHTML = '';
            for (const key in settings.worldBookList) {
                const option = new Option(key, key);
                option.title = key;
                worldBookSelect.add(option);
            }
            worldBookSelect.value = settings.worldBookList_id;
        }

        const currentWorldBookPreset = settings.worldBookList[settings.worldBookList_id] || {};
        const worldBookTextarea = document.getElementById('worldbook_content');
        if (worldBookTextarea) {
            worldBookTextarea.value = currentWorldBookPreset.content ?? '';
            const warning = worldBookTextarea.closest('.st-chatu8-field-col').querySelector('.st-chatu8-unsaved-warning');
            if (warning) $(warning).hide();
        }

        const workerSelect = document.getElementById('workerid');
        if (workerSelect) {
            workerSelect.innerHTML = '';
            for (const key in settings.workers) {
                const option = new Option(key, key);
                option.title = key;
                workerSelect.add(option);
            }
            workerSelect.value = settings.workerid;
        }

        // Load float ball settings
        // --- Migration for FAB position ---
        if (!settings.chatu8_fab_position) {
            settings.chatu8_fab_position = {
                desktop: { top: settings.chatu8_fab_top || '65vh', left: settings.chatu8_fab_left || '20px' },
                mobile: { top: '80vh', left: '10px' }
            };
            delete settings.chatu8_fab_top;
            delete settings.chatu8_fab_left;
        }
        // Ensure both desktop and mobile objects exist
        if (!settings.chatu8_fab_position.desktop) {
            settings.chatu8_fab_position.desktop = { top: '65vh', left: '20px' };
        }
        if (!settings.chatu8_fab_position.mobile) {
            settings.chatu8_fab_position.mobile = { top: '80vh', left: '10px' };
        }


        $("#enable_chatu8_fab").prop("checked", String(settings.enable_chatu8_fab) === 'true');

        // 初始化悬浮球主题预设
        if (!settings.fabThemes) {
            settings.fabThemes = JSON.parse(JSON.stringify(defaultSettings.fabThemes));
        }
        if (!settings.chatu8_fab_theme) {
            settings.chatu8_fab_theme = '自定义';
        }
        const fabThemeSelect = $("#chatu8_fab_theme");
        if (fabThemeSelect.length) {
            fabThemeSelect.empty();
            for (const themeName in settings.fabThemes) {
                const option = new Option(themeName, themeName);
                option.title = themeName;
                fabThemeSelect.append(option);
            }
            fabThemeSelect.val(settings.chatu8_fab_theme);
        }

        $("#chatu8_fab_bg_color").val(settings.chatu8_fab_bg_color || '#ADD8E6');
        $("#chatu8_fab_icon_color").val(settings.chatu8_fab_icon_color || '#FFFFFF');
        $("#chatu8_fab_opacity").val(settings.chatu8_fab_opacity ?? 1);
        $("#chatu8_fab_opacity_value").val(settings.chatu8_fab_opacity ?? 1);
        const floatBallSize = settings.chatu8_fab_size ?? 50;
        $("#chatu8_fab_size").val(floatBallSize);
        $("#chatu8_fab_size_value").val(floatBallSize);

        applyFabSettings();
        initNovelaiUI($('#ch-settings-modal'));

        // 刷新角色设置相关模块(如果角色标签页是当前激活的标签页)
        const activeTabId = $('.st-chatu8-nav-link.active').data('tab');
        if (activeTabId === 'character') {
            const characterTab = $('#st-chatu8-tab-character');
            if (characterTab.length) {
                refreshCharacterSettings(characterTab);
            }
        }
    }

    loadSettingsIntoUI();


    updateGenerationModeHandlers(); // Set initial handler based on loaded settings


    initFab(); // Initialize the float ball

    const settingsModal = $('#ch-settings-modal');
    initUpdateCheck(settingsModal, check_update);

    // Defer thumbnail generation to avoid blocking UI thread
    setTimeout(() => generateMissingThumbnails(), 5000);

    window.showChatuSettingsPanel = showSettingsPanel;
    window.loadSilterTavernChatu8Settings = loadSettingsIntoUI;

    initNovelaiUI(settingsModal);

    settingsModal.find('#ch-settings-modal-close').on('click', hideSettingsPanel);

    // Initialize modular settings

    if (extension_settings[extensionName].gestureEnabled == true || extension_settings[extensionName].gestureEnabled === "true") {
        initGestureMonitor();
    }

    // initClickTriggerMonitor 已在模块导入时自动启动，无需重复调用
    initGeneralSettings(settingsModal);
    initLogSettings(settingsModal);
    // AI 设置已统一到 LLM 设置页面
    initThemeSettings(settingsModal, settings, currentPreviewTheme);
    initPromptSettings(settingsModal, settings);

    settingsModal.on('click', '.st-chatu8-toggle', function () {
        const checkbox = $(this).find('input[type="checkbox"]');
        if (checkbox.length) {
            checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
        }
    });

    settingsModal.find('.st-chatu8-nav-link').on('click', function (e) {
        e.preventDefault();
        const tabId = $(this).data('tab');

        // Do nothing if clicking the already active tab. This prevents reloading when the panel is first opened.
        if ($(this).hasClass('active')) {
            return;
        }

        // On tab change, reload the settings to ensure sync. This will discard any unsaved changes.
        loadSettingsIntoUI();

        // Update nav links' active state
        settingsModal.find('.st-chatu8-nav-link').removeClass('active');
        $(this).addClass('active');

        // Hide all tab content panels, then show the target one
        const tabContents = settingsModal.find('.st-chatu8-content > .st-chatu8-tab-content');
        tabContents.removeClass('active'); // No need to hide, CSS handles it

        const targetTab = settingsModal.find(`#st-chatu8-tab-${tabId}`);
        if (targetTab.length) {
            targetTab.addClass('active');
            if (tabId === 'log') {
                updateLogView();
            } else if (tabId === 'character') {
                // 刷新角色设置UI（包括角色启用管理）
                refreshCharacterSettings(targetTab);
            }
            // 世界书标签页刷新已禁用（功能暂时隐藏）
            // else if (tabId === 'worldbook') {
            //     refreshWorldBookSettings(targetTab);
            // }
        }

        // Save the last tab
        if (settings.lastTab !== tabId) {
            settings.lastTab = tabId;
            saveSettingsDebounced();
        }
    });

    // Activate the last opened tab, or default to 'main'
    const lastTabId = settings.lastTab || 'main';
    const initialTabLink = settingsModal.find(`.st-chatu8-nav-link[data-tab="${lastTabId}"]`);

    if (initialTabLink.length && !initialTabLink.hasClass('active')) {
        // Manually set the active classes without triggering click,
        // because loadSettingsIntoUI() has already been called.
        settingsModal.find('.st-chatu8-nav-link').removeClass('active');
        initialTabLink.addClass('active');

        settingsModal.find('.st-chatu8-content > .st-chatu8-tab-content').removeClass('active');
        const initialTabContent = settingsModal.find(`#st-chatu8-tab-${lastTabId}`);
        initialTabContent.addClass('active');

        if (lastTabId === 'log') {
            updateLogView();
        }
    } else if (settingsModal.find('.st-chatu8-nav-link.active').length === 0) {
        // Fallback if saved tab is invalid or no tab is active
        const firstLink = settingsModal.find('.st-chatu8-nav-link').first();
        firstLink.addClass('active');
        const firstTabId = firstLink.data('tab');
        settingsModal.find(`#st-chatu8-tab-${firstTabId}`).addClass('active');
    }

    // Bind events for duplicated prompt replace controls
    initPromptReplaceControls(settingsModal);
    // 世界书控件初始化已禁用（功能暂时隐藏）
    // initWorldBookControls(settingsModal);
    // 但仍需注册事件监听器，以支持 {{角色启用列表}} 等占位符替换
    setupWorldBookEventListener();
    // Bind events for character settings
    initCharacterSettings(settingsModal);
    initWorkerControls(settingsModal);

    // Bind other controls
    initApiConnectionTests(settingsModal);
    initLoraControls(settingsModal);
    settingsModal.find('#eidtwork').on('click', eidtwork);

    initImageUpload(settingsModal);
    initImageCache(settingsModal);
    initVocabulary(settingsModal);
    initBananaUI(settingsModal);
    initRegexSettings(settingsModal);
    initLLMSettings(settingsModal);
    initSendData(settingsModal);

    settingsModal.find('#migrate-database-btn').on('click', migrateDatabase);

    // 同步服务器图片按钮
    settingsModal.find('#sync-server-images-btn').on('click', async function () {
        const button = $(this);
        const originalText = button.text();

        // 创建进度条模态框
        const progressModal = $(`
            <div class="st-chatu8-progress-modal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            ">
                <div class="st-chatu8-progress-container" style="
                    background: white;
                    border-radius: 8px;
                    padding: 24px;
                    min-width: 400px;
                    max-width: 500px;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                ">
                    <h3 style="margin: 0 0 16px 0; color: #333;">同步服务器图片</h3>
                    <div class="st-chatu8-progress-bar" style="
                        width: 100%;
                        height: 24px;
                        background: #f0f0f0;
                        border-radius: 12px;
                        overflow: hidden;
                        margin-bottom: 12px;
                    ">
                        <div class="st-chatu8-progress-fill" style="
                            height: 100%;
                            background: linear-gradient(90deg, #4CAF50, #45a049);
                            width: 0%;
                            transition: width 0.3s ease;
                            border-radius: 12px;
                        "></div>
                    </div>
                    <div class="st-chatu8-progress-text" style="
                        text-align: center;
                        color: #666;
                        font-size: 14px;
                        min-height: 20px;
                    ">准备开始...</div>
                    <div class="st-chatu8-progress-percentage" style="
                        text-align: center;
                        color: #333;
                        font-weight: bold;
                        margin-top: 8px;
                    ">0%</div>
                </div>
            </div>
        `);

        $('body').append(progressModal);
        button.prop('disabled', true).text('同步中...');

        try {
            const result = await syncServerImagesWithStorage('chatu8', (current, total, message) => {
                const percentage = Math.floor((current / total) * 100);
                progressModal.find('.st-chatu8-progress-fill').css('width', `${percentage}%`);
                progressModal.find('.st-chatu8-progress-text').text(message);
                progressModal.find('.st-chatu8-progress-percentage').text(`${percentage}%`);
            });

            // 移除进度条
            progressModal.remove();

            // 显示结果
            if (result.deletedCount > 0 || result.errors.length > 0) {
                const message = `同步完成！\n删除了 ${result.deletedCount} 个不同步的图片${result.errors.length > 0 ? `\n失败 ${result.errors.length} 个` : ''}`;
                alert(message);
                console.log('[Sync] 同步结果:', result);
            } else {
                alert('同步完成！所有图片都已同步，无需删除。');
            }
        } catch (error) {
            console.error('[Sync] 同步失败:', error);
            progressModal.remove();
            alert(`同步失败: ${error.message}`);
        } finally {
            button.prop('disabled', false).text(originalText);
        }
    });

    settingsModal.find('#sd_csize').on('change', () => size_change('sd'));
    settingsModal.find('#novelai_size').on('change', () => size_change('novelai'));
    settingsModal.find('#comfyui_size').on('change', () => size_change('comfyui'));

    // Auto-save settings on change for all other inputs
    const allIDs = Object.keys(defaultSettings);
    const ignoreIDs = ['yushe', 'yusheid', 'fixedPrompt', 'fixedPrompt_end', 'negativePrompt', 'workers', 'workerid', 'worker', 'themes', 'theme_id', 'prompt_replace', 'prompt_replace_id', 'prompt_replace_text', 'UCP', 'AQT', 'nai3CharRef', 'worldBookList', 'worldBookList_id', 'worldbook_content'];

    // Slider and number input sync for NovelAI
    $('#InformationExtracted, #InformationExtracted_range').on('input', (event) => {
        const value = $(event.target).val();
        $('#InformationExtracted').val(value);
        $('#InformationExtracted_range').val(value);
        settings.InformationExtracted = value;
        saveSettingsDebounced();
    });
    $('#ReferenceStrength, #ReferenceStrength_range').on('input', (event) => {
        const value = $(event.target).val();
        $('#ReferenceStrength').val(value);
        $('#ReferenceStrength_range').val(value);
        settings.ReferenceStrength = value;
        saveSettingsDebounced();
    });

    // Float ball settings listeners
    $('#enable_chatu8_fab').on('change', (event) => {
        settings.enable_chatu8_fab = $(event.target).prop('checked').toString();
        saveSettingsDebounced();
        applyFabSettings();
    });

    // 悬浮球主题预设选择
    $('#chatu8_fab_theme').on('change', (event) => {
        const themeName = $(event.target).val();
        settings.chatu8_fab_theme = themeName;

        // 如果不是"自定义"，则应用预设的颜色和透明度
        if (themeName !== '自定义' && settings.fabThemes && settings.fabThemes[themeName]) {
            const theme = settings.fabThemes[themeName];
            settings.chatu8_fab_bg_color = theme.bgColor;
            settings.chatu8_fab_icon_color = theme.iconColor;
            settings.chatu8_fab_opacity = theme.opacity;

            // 更新UI
            $('#chatu8_fab_bg_color').val(theme.bgColor);
            $('#chatu8_fab_icon_color').val(theme.iconColor);
            $('#chatu8_fab_opacity').val(theme.opacity);
            $('#chatu8_fab_opacity_value').val(theme.opacity);
        }

        saveSettingsDebounced();
        applyFabSettings();
    });

    $('#chatu8_fab_bg_color').on('change', (event) => {
        settings.chatu8_fab_bg_color = $(event.target).val();
        // 手动修改颜色时，自动切换到"自定义"主题
        if (settings.chatu8_fab_theme !== '自定义') {
            settings.chatu8_fab_theme = '自定义';
            // 保存当前自定义值到自定义预设
            if (settings.fabThemes && settings.fabThemes['自定义']) {
                settings.fabThemes['自定义'].bgColor = settings.chatu8_fab_bg_color;
            }
            $('#chatu8_fab_theme').val('自定义');
        }
        saveSettingsDebounced();
        applyFabSettings();
    });
    $('#chatu8_fab_icon_color').on('change', (event) => {
        settings.chatu8_fab_icon_color = $(event.target).val();
        // 手动修改颜色时，自动切换到"自定义"主题
        if (settings.chatu8_fab_theme !== '自定义') {
            settings.chatu8_fab_theme = '自定义';
            // 保存当前自定义值到自定义预设
            if (settings.fabThemes && settings.fabThemes['自定义']) {
                settings.fabThemes['自定义'].iconColor = settings.chatu8_fab_icon_color;
            }
            $('#chatu8_fab_theme').val('自定义');
        }
        saveSettingsDebounced();
        applyFabSettings();
    });
    $('#chatu8_fab_opacity, #chatu8_fab_opacity_value').on('input', (event) => {
        const value = parseFloat($(event.target).val());
        $('#chatu8_fab_opacity').val(value);
        $('#chatu8_fab_opacity_value').val(value);
        settings.chatu8_fab_opacity = value;
        // 手动修改透明度时，自动切换到"自定义"主题
        if (settings.chatu8_fab_theme !== '自定义') {
            settings.chatu8_fab_theme = '自定义';
            // 保存当前自定义值到自定义预设
            if (settings.fabThemes && settings.fabThemes['自定义']) {
                settings.fabThemes['自定义'].opacity = value;
            }
            $('#chatu8_fab_theme').val('自定义');
        }
        saveSettingsDebounced();
        applyFabSettings();
    });
    $('#chatu8_fab_size, #chatu8_fab_size_value').on('input', (event) => {
        const value = parseInt($(event.target).val(), 10);
        $('#chatu8_fab_size').val(value);
        $('#chatu8_fab_size_value').val(value);
        settings.chatu8_fab_size = value;
        saveSettingsDebounced();
        applyFabSettings();
    });


    allIDs.forEach(key => {
        if (ignoreIDs.includes(key)) return;
        const selector = generationTabs.reduce((acc, mode) => {
            const suffix = getSuffix(mode);
            if (document.getElementById(key + suffix)) {
                acc.push(`#${key}${suffix}`);
            }
            return acc;
        }, [`#${key}`]).join(', ');

        const element = $(selector);
        if (element.length) {
            const elType = element.prop('type');
            const event = (elType === 'text' || elType === 'number' || element.is('textarea')) ? 'input' : 'change';

            element.on(event, function () {
                let value;
                if (elType === 'checkbox') {
                    value = $(this).prop('checked').toString();
                } else {
                    value = $(this).val();
                }

                if (key === "sdUrl" || key === "comfyuiUrl") {
                    value = removeTrailingSlash(value);
                    validateUrlInput(this);
                }

                // For duplicated fields, they all write to the same setting
                const settingKey = key;
                settings[settingKey] = value;
                saveSettingsDebounced();

                // If the generation mode is changed, re-initialize the event handlers
                if (settingKey === 'mode') {
                    updateGenerationModeHandlers();
                }

                // If image alignment is changed, re-apply the image frame style
                if (settingKey === 'imageAlignment') {
                    const currentTheme = settings.themes?.[settings.theme_id] || {};
                    applyImageFrameStyle(settings.image_frame_style || '无样式', isThemeDark(currentTheme));
                }

                // If it's a duplicated field, sync the others
                if (element.length > 1) {
                    element.not(this).val(value);
                }
            });
        }
    });

    settingsModal.find('#nai3CharRef').on('change', function () {
        const checkbox = $(this);
        if (checkbox.prop('checked')) {
            stylishConfirm("开启角色参考图每次请求都将会花费5Anlas点数，你确定要开启吗？")
                .then(confirmed => {
                    if (confirmed) {
                        settings.nai3CharRef = 'true';
                        saveSettingsDebounced();
                    } else {
                        checkbox.prop('checked', false);
                    }
                });
        } else {
            settings.nai3CharRef = 'false';
            saveSettingsDebounced();
        }
    });
}
