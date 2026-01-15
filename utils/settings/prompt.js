// @ts-nocheck
import { extension_settings } from "../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../script.js";
import { extensionName } from '../config.js';
import { getSuffix, stylInput, stylishConfirm } from '../ui_common.js';
import { dbs } from '../database.js';
import { callTranslation, parseTranslationResult, tagsToJsonString } from '../ai.js';
import { showPresetVisualSelector } from './presetVisualSelector.js';


export const generationTabs = ['sd', 'novelai', 'comfyui'];

// Translation helpers
function stripChineseAnnotations(text) {
    if (!text) return '';
    // 移除所有中文全角括号及其中内容（例如： （一个女孩））
    return text.replace(/（[^）]*）/g, '');
}
// parseTranslationResult 已从 ai.js 导入
async function translateAndAnnotateField(fieldBase, suffix) {
    const textarea = document.getElementById(fieldBase + suffix);
    if (!textarea) return;
    const button = document.getElementById(`translate_${fieldBase}${suffix}`);
    try {
        if (button) {
            button.disabled = true;
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-language');
                icon.classList.add('fa-spinner', 'fa-spin');
            }
        }
        const originalVal = textarea.value || '';
        const cleaned = stripChineseAnnotations(originalVal);
        const normalized = cleaned.replace(/，/g, ',').replace(/[\r\n]+/g, ',');

        // 智能分割，保护 $...$ 包裹的标记不被拆分
        const smartSplit = (text) => {
            const result = [];
            let current = '';
            let insideDollar = false;
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                if (char === '$') {
                    insideDollar = !insideDollar;
                    current += char;
                } else if (char === ',' && !insideDollar) {
                    const trimmed = current.trim();
                    if (trimmed) result.push(trimmed);
                    current = '';
                } else {
                    current += char;
                }
            }
            if (current.trim()) result.push(current.trim());
            return result;
        };

        const allTokens = smartSplit(normalized);
        // 过滤掉 $...$ 包裹的标记（这些是角色/服装预设，不需要翻译）
        const tokens = allTokens.filter(t => !(t.startsWith('$') && t.endsWith('$')));
        if (tokens.length === 0) return;

        // 清理符号函数：移除 {}[]() 和权重数字
        const cleanTagForTranslation = (tag) => {
            return tag
                .replace(/^[\{\[\(\<]+|[\}\]\)\>]+$/g, '')  // 移除首尾的括号
                .replace(/^\{+|\}+$/g, '')  // 再次确保移除花括号
                .replace(/:[\d.]+$/, '')  // 移除末尾权重如 :0.8
                .trim();
        };

        // 清理后的 token 发送给 AI
        const cleanedTokensForAI = tokens.map(t => cleanTagForTranslation(t)).filter(Boolean);
        const textToTranslate = tagsToJsonString(Array.from(new Set(cleanedTokensForAI)));

        const response = await callTranslation(textToTranslate);
        const map = parseTranslationResult(response);

        // 使用智能分割应用翻译结果，保护 $...$ 标记
        const originalTokens = smartSplit(normalized);
        const annotated = originalTokens.map(t => {
            // 跳过 $...$ 包裹的标记
            if (t.startsWith('$') && t.endsWith('$')) return t;
            // 用清理后的 key 去匹配
            const cleanedKey = cleanTagForTranslation(t);
            if (map[cleanedKey]) return `${t}（${map[cleanedKey]}）`;
            // 也尝试直接匹配
            if (map[t]) return `${t}（${map[t]}）`;
            return t;
        }).join(', ');
        textarea.value = annotated;
        $(textarea).trigger('input'); // 触发未保存提示刷新
    } catch (e) {
        console.error('Tag translation failed:', e);
        alert(`翻译失败：${e.message || e}`);
    } finally {
        if (button) {
            button.disabled = false;
            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-spinner', 'fa-spin');
                icon.classList.add('fa-language');
            }
        }
    }
}

// --- Autocomplete Logic ---

async function handleAutocomplete(inputEl, resultsEl) {
    const text = inputEl.value;
    const cursorPosition = inputEl.selectionStart;

    // 找到光标前后的逗号位置
    const textBeforeCursor = text.substring(0, cursorPosition);
    const textAfterCursor = text.substring(cursorPosition);

    const lastCommaBefore = Math.max(textBeforeCursor.lastIndexOf(','), textBeforeCursor.lastIndexOf('，'));
    const nextCommaAfter = textAfterCursor.search(/[,，]/);

    const startIndex = lastCommaBefore + 1;
    const endIndex = nextCommaAfter !== -1 ? cursorPosition + nextCommaAfter : text.length;

    const query = text.substring(startIndex, endIndex).trim();

    if (query.length < 1) {
        resultsEl.style.display = 'none';
        return;
    }

    try {
        // 从设置中读取搜索选项
        const settings = extension_settings[extensionName];
        const startsWith = String(settings.vocabulary_search_startswith) === 'true';
        const limit = parseInt(settings.vocabulary_search_limit, 10);
        const sortBy = settings.vocabulary_search_sort;

        const results = await dbs.searchTags(query, { startsWith, limit, sortBy });
        resultsEl.innerHTML = '';

        if (results.length > 0) {
            results.forEach(tag => {
                const item = document.createElement('div');
                item.className = 'ch-autocomplete-item';
                item.textContent = `${tag.name} (${tag.translation})`;
                item.addEventListener('click', () => handleResultClick(inputEl, resultsEl, tag));
                resultsEl.appendChild(item);
            });
            resultsEl.style.display = 'block';
        } else {
            resultsEl.style.display = 'none';
        }
    } catch (error) {
        console.error('Tag search failed:', error);
        resultsEl.style.display = 'none';
    }
}

function handleResultClick(inputEl, resultsEl, tag) {
    const text = inputEl.value;
    const cursorPosition = inputEl.selectionStart;

    // 找到光标前后的逗号位置
    const textBeforeCursor = text.substring(0, cursorPosition);
    const textAfterCursor = text.substring(cursorPosition);

    const lastCommaBefore = Math.max(textBeforeCursor.lastIndexOf(','), textBeforeCursor.lastIndexOf('，'));
    const nextCommaAfter = textAfterCursor.search(/[,，]/);

    const startIndex = lastCommaBefore + 1;
    const endIndex = nextCommaAfter !== -1 ? cursorPosition + nextCommaAfter : text.length;

    // The 'tag' parameter is now the full tag object
    const newTagText = `${tag.name}（${tag.translation}）`;

    // 构建新文本
    const textBefore = text.substring(0, startIndex);
    const textAfter = text.substring(endIndex);

    // 保留前导空格
    const leadingSpace = text.substring(startIndex, startIndex + 1) === ' ' ? ' ' : '';

    // 检查后面是否有内容，如果有且不是逗号开头则添加逗号
    const trimmedTextAfter = textAfter.trim();
    const trailingComma = trimmedTextAfter.length > 0 && !trimmedTextAfter.startsWith(',') ? ', ' : '';

    const newText = `${textBefore.trim() ? textBefore : ''}${leadingSpace}${newTagText}${trailingComma}${textAfter.trim() ? textAfter : ''}`;

    // 转换中文逗号为英文逗号
    inputEl.value = newText.replace(/，/g, ',');
    resultsEl.style.display = 'none';
    inputEl.focus();

    // 设置光标位置到插入的 tag 之后
    const newCursorPosition = (textBefore + leadingSpace + newTagText + trailingComma).length;
    setTimeout(() => inputEl.setSelectionRange(newCursorPosition, newCursorPosition), 0);
}

export function initPromptSettings(settingsModal, settings) {
    // Close autocomplete on outside click
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.st-chatu8-field-col')) {
            $('.ch-autocomplete-results').hide();
        }
    });

    // Bind events for duplicated prompt controls
    generationTabs.forEach(mode => {
        const suffix = getSuffix(mode);
        settingsModal.find(`#yusheid${suffix}`).on('change', () => st_chatu8_tishici_change(mode, settings));
        settingsModal.find(`#st_chatu8_tishici_save_style${suffix}`).on('click', () => st_chatu8_tishici_save(mode, settings)); // Save As
        settingsModal.find(`#st_chatu8_tishici_update_style${suffix}`).on('click', () => st_chatu8_tishici_update(mode, settings)); // Save
        settingsModal.find(`#st_chatu8_tishici_delete_style${suffix}`).on('click', () => st_chatu8_tishici_delete(mode, settings));
        settingsModal.find(`#st_chatu8_tishici_export_current${suffix}`).on('click', () => st_chatu8_tishici_export_current(settings));
        settingsModal.find(`#st_chatu8_tishici_export_all${suffix}`).on('click', () => st_chatu8_tishici_export_all(settings));
        settingsModal.find(`#st_chatu8_tishici_import${suffix}`).on('click', () => st_chatu8_tishici_import(settings));

        // 绑定可视化选择按钮
        settingsModal.find(`#st_chatu8_tishici_visual_select${suffix}`).on('click', () => {
            showPresetVisualSelector(mode, settings, (presetName) => {
                // 更新下拉框并触发 change 事件
                const selectElement = document.getElementById('yusheid' + suffix);
                if (selectElement) {
                    selectElement.value = presetName;
                    $(selectElement).trigger('change');
                }
            });
        });

        // Show/hide warning on input change, instead of saving immediately
        const promptTextareas = [`#fixedPrompt${suffix}`, `#fixedPrompt_end${suffix}`, `#negativePrompt${suffix}`];

        promptTextareas.forEach(selector => {
            const textarea = $(selector)[0];
            const resultsContainer = $(`${selector}-results`)[0];
            if (textarea && resultsContainer) {
                $(textarea).on('input', () => handleAutocomplete(textarea, resultsContainer));
                // Prevent closing when clicking on the textarea itself
                $(textarea).on('click', (event) => event.stopPropagation());
            }
        });

        $(`#fixedPrompt${suffix}, #fixedPrompt_end${suffix}, #negativePrompt${suffix}`).on('input', function () {
            const yusheIdKey = `yusheid${mode === 'sd' ? '_sd' : suffix}`;
            const presetName = settings[yusheIdKey];
            const currentPreset = settings.yushe[presetName] || {};
            const field = $(this).attr('id').replace(suffix, '');
            const isDirty = $(this).val() !== (currentPreset[field] ?? '');
            const warning = $(this).closest('.st-chatu8-field-col').find('.st-chatu8-unsaved-warning');

            if (isDirty) {
                $(warning).show();
            } else {
                $(warning).hide();
            }
        });

        // 绑定翻译按钮（固定正面提示词、后置固定正面提示词）
        settingsModal.find(`#translate_fixedPrompt${suffix}`).on('click', () => translateAndAnnotateField('fixedPrompt', suffix));
        settingsModal.find(`#translate_fixedPrompt_end${suffix}`).on('click', () => translateAndAnnotateField('fixedPrompt_end', suffix));
    });
}

function st_chatu8_tishici_change(mode, settings) {
    const suffix = getSuffix(mode);
    const selectElement = document.getElementById("yusheid" + suffix);
    const newPresetId = selectElement.value;
    const yusheIdKey = `yusheid${mode === 'sd' ? '_sd' : suffix}`;
    const currentPresetId = settings[yusheIdKey];

    // If we are not actually changing, do nothing.
    if (newPresetId === currentPresetId) return;

    const currentPreset = settings.yushe[currentPresetId] || {};
    const fixedPrompt = document.getElementById("fixedPrompt" + suffix).value;
    const fixedPrompt_end = document.getElementById("fixedPrompt_end" + suffix).value;
    const negativePrompt = document.getElementById("negativePrompt" + suffix).value;

    const isDirty = (fixedPrompt !== (currentPreset.fixedPrompt ?? '')) ||
        (fixedPrompt_end !== (currentPreset.fixedPrompt_end ?? '')) ||
        (negativePrompt !== (currentPreset.negativePrompt ?? ''));

    const switchPreset = () => {
        settings[yusheIdKey] = newPresetId;
        saveSettingsDebounced();
        const newPreset = settings.yushe[newPresetId] || {};
        document.getElementById("fixedPrompt" + suffix).value = newPreset.fixedPrompt ?? '';
        document.getElementById("fixedPrompt_end" + suffix).value = newPreset.fixedPrompt_end ?? '';
        document.getElementById("negativePrompt" + suffix).value = newPreset.negativePrompt ?? '';

        // Hide warnings
        const fields = ['fixedPrompt', 'fixedPrompt_end', 'negativePrompt'];
        fields.forEach(field => {
            const textarea = document.getElementById(field + suffix);
            const warning = textarea.closest('.st-chatu8-field-col').querySelector('.st-chatu8-unsaved-warning');
            if (warning) $(warning).hide();
        });
    };

    if (isDirty) {
        stylishConfirm("您有未保存的更改。要放弃这些更改并切换预设吗？").then(confirmed => {
            if (confirmed) {
                switchPreset();
            } else {
                // Revert dropdown to the old value
                selectElement.value = currentPresetId;
            }
        });
    } else {
        switchPreset();
    }
}

function st_chatu8_tishici_save(mode, settings) { // This is now "Save As"
    const suffix = getSuffix(mode);
    stylInput("请输入新配置的名称").then((result) => {
        if (result && result.trim() !== '') {
            const fixedPrompt = document.getElementById("fixedPrompt" + suffix).value;
            const fixedPrompt_end = document.getElementById("fixedPrompt_end" + suffix).value;
            const negativePrompt = document.getElementById("negativePrompt" + suffix).value;
            const yusheIdKey = `yusheid${mode === 'sd' ? '_sd' : suffix}`;

            settings.yushe[result] = { "fixedPrompt": fixedPrompt, "fixedPrompt_end": fixedPrompt_end, "negativePrompt": negativePrompt };
            settings[yusheIdKey] = result;
            saveSettingsDebounced();
            // This needs to call a function in ui.js to reload the whole UI
            window.loadSilterTavernChatu8Settings();
            alert(`预设 "${result}" 已保存。`);
        }
    });
}

function st_chatu8_tishici_update(mode, settings) { // This is the new "Save"
    const suffix = getSuffix(mode);
    const yusheIdKey = `yusheid${mode === 'sd' ? '_sd' : suffix}`;
    const presetName = settings[yusheIdKey];

    if (!presetName || !settings.yushe[presetName]) {
        alert("没有活动的预设可保存。请先“另存为”一个新预设。");
        return;
    }

    stylishConfirm(`确定要覆盖当前预设 "${presetName}" 吗？`).then(confirmed => {
        if (confirmed) {
            const fixedPrompt = document.getElementById("fixedPrompt" + suffix).value;
            const fixedPrompt_end = document.getElementById("fixedPrompt_end" + suffix).value;
            const negativePrompt = document.getElementById("negativePrompt" + suffix).value;

            settings.yushe[presetName] = { "fixedPrompt": fixedPrompt, "fixedPrompt_end": fixedPrompt_end, "negativePrompt": negativePrompt };
            saveSettingsDebounced();

            // Hide warnings after saving
            const fields = ['fixedPrompt', 'fixedPrompt_end', 'negativePrompt'];
            fields.forEach(field => {
                const textarea = document.getElementById(field + suffix);
                const warning = textarea.closest('.st-chatu8-field-col').querySelector('.st-chatu8-unsaved-warning');
                if (warning) $(warning).hide();
            });
        }
    });
}

function st_chatu8_tishici_delete(mode, settings) {
    const suffix = getSuffix(mode);
    const selectElement = document.getElementById("yusheid" + suffix);
    const valueToDelete = selectElement.value;
    const yusheIdKey = `yusheid${mode === 'sd' ? '_sd' : suffix}`;

    if (valueToDelete === "默认") {
        alert("默认配置不能删除");
        return;
    }

    // Check if the preset is used by other generation types
    const modesUsingPreset = [];
    const allModes = {
        sd: { key: 'yusheid_sd', name: 'SD' },
        novelai: { key: 'yusheid_novelai', name: 'NovelAI' },
        comfyui: { key: 'yusheid_comfyui', name: 'ComfyUI' }
    };

    for (const modeKey in allModes) {
        if (modeKey === mode) continue;

        const modeInfo = allModes[modeKey];
        if (settings[modeInfo.key] === valueToDelete) {
            modesUsingPreset.push(modeInfo.name);
        }
    }

    if (modesUsingPreset.length > 0) {
        alert(`无法删除预设 "${valueToDelete}"，因为它正在被以下模式使用：${modesUsingPreset.join('、 ')}。\n请先在这些模式中切换到其他预设。`);
        return;
    }

    stylishConfirm("是否确定删除").then((result) => {
        if (result) {
            Reflect.deleteProperty(settings.yushe, valueToDelete);
            settings[yusheIdKey] = "默认";
            saveSettingsDebounced();
            window.loadSilterTavernChatu8Settings();
        }
    });
}

function st_chatu8_tishici_export_current(settings) {
    const activeTabId = document.querySelector('.st-chatu8-tab-content.active').id.replace('ch-tab-', '');
    const suffix = getSuffix(activeTabId);

    console.log(suffix);

    let yusheIdKey = '';

    if (suffix.includes('sd')) {

        yusheIdKey = "yusheid_sd"

    }
    if (suffix.includes('novelai')) {

        yusheIdKey = "yusheid_novelai"

    }

    if (suffix.includes('comfyui')) {

        yusheIdKey = "yusheid_comfyui"

    }

    console.log("111", yusheIdKey);

    const selectedId = settings[yusheIdKey];

    console.log(settings);



    if (!selectedId || !settings.yushe[selectedId]) {
        alert("没有选中的预设可导出。");
        return;
    }
    const dataToExport = { [selectedId]: settings.yushe[selectedId] };
    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `st-chatu8-prompt-preset-${selectedId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function st_chatu8_tishici_export_all(settings) {
    if (!settings.yushe || Object.keys(settings.yushe).length === 0) {
        alert("没有预设可导出。");
        return;
    }
    const dataStr = JSON.stringify(settings.yushe, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "st-chatu8-prompt-presets-all.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function st_chatu8_tishici_import(settings) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = readerEvent => {
            try {
                const importedData = JSON.parse(readerEvent.target.result);
                let newPresetsCount = 0;
                for (const key in importedData) {
                    if (importedData.hasOwnProperty(key)) {
                        if (!settings.yushe.hasOwnProperty(key)) {
                            newPresetsCount++;
                        }
                        settings.yushe[key] = importedData[key];
                    }
                }
                saveSettingsDebounced();
                window.loadSilterTavernChatu8Settings();
                alert(`成功导入 ${Object.keys(importedData).length} 个预设，其中 ${newPresetsCount} 个是全新的。`);
            } catch (err) {
                alert("导入失败，请确保文件是正确的JSON格式。");
                console.error("Error importing presets:", err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}
