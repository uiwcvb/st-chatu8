// @ts-nocheck
/**
 * 角色启用管理模块
 * 处理角色启用列表的 CRUD 操作和导入导出
 */

import { extension_settings } from "../../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../../script.js";
import { extensionName } from '../../config.js';
import { stylInput, stylishConfirm } from '../../ui_common.js';
import { encryptExportData, decryptImportData } from './crypto.js';
import { loadCharacterPresetList } from './characterPreset.js';
import { loadOutfitPresetList } from './outfitPreset.js';

// ========== 角色启用管理 ==========

/**
 * 设置角色启用管理控件
 */
export function setupCharacterEnableControls(container) {
    // 加载预设列表
    loadCharacterEnablePresetList();

    // 绑定预设选择
    container.find('#character_enable_preset_id').on('change', loadCharacterEnablePreset);

    // 绑定按钮
    container.find('#character_enable_update').on('click', updateCharacterEnablePreset);
    container.find('#character_enable_save_as').on('click', saveCharacterEnablePresetAs);
    container.find('#character_enable_export').on('click', exportCharacterEnablePreset);
    container.find('#character_enable_export_all').on('click', exportAllCharacterEnablePresets);
    container.find('#character_enable_import').on('click', importCharacterEnablePreset);
    container.find('#character_enable_delete').on('click', deleteCharacterEnablePreset);
    container.find('#character_enable_check').on('click', checkCharacterList);
    container.find('#character_enable_add').on('click', addCharacterFromSelector);
    container.find('#character_enable_refresh').on('click', loadCharacterSelector);

    // 加载当前预设
    loadCharacterEnablePreset();

    // 加载角色选择器
    loadCharacterSelector();
}

export function loadCharacterEnablePresetList() {
    const settings = extension_settings[extensionName];
    const select = document.getElementById('character_enable_preset_id');

    if (!select) return;

    select.innerHTML = '';

    for (const presetName in settings.characterEnablePresets) {
        const option = document.createElement('option');
        option.value = presetName;
        option.textContent = presetName;
        select.add(option);
    }

    select.value = settings.characterEnablePresetId;
}

export function loadCharacterEnablePreset() {
    const settings = extension_settings[extensionName];
    const select = document.getElementById('character_enable_preset_id');
    if (!select) return;

    const presetId = select.value;
    settings.characterEnablePresetId = presetId;

    const preset = settings.characterEnablePresets[presetId];
    const textarea = document.getElementById('character_enable_list');

    if (textarea && preset) {
        // 将角色数组转换为换行分割的字符串
        textarea.value = (preset.characters || []).join('\n');
    }

    saveSettingsDebounced();
}

function updateCharacterEnablePreset() {
    const settings = extension_settings[extensionName];
    const presetId = settings.characterEnablePresetId;

    if (!presetId || !settings.characterEnablePresets[presetId]) {
        toastr.warning('没有活动的角色启用预设可保存。请先"另存为"一个新预设。');
        return;
    }

    // 直接保存，不弹确认框
    saveCurrentCharacterEnableData(presetId);
    toastr.success(`角色启用预设 "${presetId}" 已保存`);
}

function saveCharacterEnablePresetAs() {
    stylInput("请输入新角色启用预设的名称").then((result) => {
        if (result && result.trim() !== '') {
            const settings = extension_settings[extensionName];
            saveCurrentCharacterEnableData(result);
            settings.characterEnablePresetId = result;
            loadCharacterEnablePresetList();
            alert(`角色启用预设 "${result}" 已保存。`);
        }
    });
}

function saveCurrentCharacterEnableData(presetId) {
    const settings = extension_settings[extensionName];
    const textarea = document.getElementById('character_enable_list');

    if (!textarea) return;

    // 将文本框内容按行分割，过滤空行
    const characters = textarea.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    settings.characterEnablePresets[presetId] = {
        characters: characters
    };

    saveSettingsDebounced();
}

function deleteCharacterEnablePreset() {
    const settings = extension_settings[extensionName];
    const presetId = document.getElementById('character_enable_preset_id')?.value;

    if (presetId === "默认启用列表") {
        alert("默认预设不能删除");
        return;
    }

    stylishConfirm("是否确定删除该角色启用预设").then((result) => {
        if (result) {
            delete settings.characterEnablePresets[presetId];
            settings.characterEnablePresetId = "默认启用列表";
            loadCharacterEnablePresetList();
            loadCharacterEnablePreset();
            saveSettingsDebounced();
        }
    });
}

async function exportCharacterEnablePreset() {
    const settings = extension_settings[extensionName];
    const presetId = settings.characterEnablePresetId;
    const preset = settings.characterEnablePresets[presetId];

    if (!preset) {
        alert("没有选中的角色启用预设可导出。");
        return;
    }

    // 检查是否有关联的角色列表
    const relatedCharacters = preset.characters || [];

    let dataToExport = {
        characterEnablePresets: { [presetId]: preset }
    };

    // 如果有关联角色,询问用户是否一起导出
    if (relatedCharacters.length > 0) {
        const confirmMessage = `检测到该列表包含 ${relatedCharacters.length} 个角色:\n${relatedCharacters.join('\n')}\n\n是否一起导出相关角色?`;
        const includeCharacters = await stylishConfirm(confirmMessage);

        if (includeCharacters) {
            dataToExport.characters = {};
            relatedCharacters.forEach(charName => {
                if (settings.characterPresets[charName]) {
                    const charPreset = settings.characterPresets[charName];
                    dataToExport.characters[charName] = charPreset;

                    // 同时收集该角色的服装
                    const charOutfits = charPreset.outfits || [];
                    if (charOutfits.length > 0) {
                        if (!dataToExport.outfits) {
                            dataToExport.outfits = {};
                        }
                        charOutfits.forEach(outfitName => {
                            if (settings.outfitPresets[outfitName]) {
                                dataToExport.outfits[outfitName] = settings.outfitPresets[outfitName];
                            }
                        });
                    }
                }
            });
        }
    }

    // 使用统一的加密导出函数
    dataToExport = await encryptExportData(dataToExport);

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `st-chatu8-角色启用列表-${presetId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function exportAllCharacterEnablePresets() {
    const settings = extension_settings[extensionName];
    if (!settings.characterEnablePresets || Object.keys(settings.characterEnablePresets).length === 0) {
        alert("没有角色启用预设可导出。");
        return;
    }

    // 收集所有角色启用预设中的角色和关联的服装
    const allCharacters = new Set();
    const allOutfits = new Set();

    for (const presetName in settings.characterEnablePresets) {
        const preset = settings.characterEnablePresets[presetName];
        const characters = preset.characters || [];
        characters.forEach(charName => {
            allCharacters.add(charName);
            // 收集该角色的服装
            if (settings.characterPresets[charName]) {
                const charOutfits = settings.characterPresets[charName].outfits || [];
                charOutfits.forEach(outfitName => allOutfits.add(outfitName));
            }
        });
    }

    let dataToExport = {
        characterEnablePresets: settings.characterEnablePresets
    };

    // 如果有关联角色,询问用户是否一起导出
    if (allCharacters.size > 0) {
        const confirmMessage = `检测到所有列表共包含 ${allCharacters.size} 个不同的角色:\n${Array.from(allCharacters).join('\n')}\n\n是否一起导出相关角色?`;
        const includeCharacters = await stylishConfirm(confirmMessage);

        if (includeCharacters) {
            dataToExport.characters = {};
            allCharacters.forEach(charName => {
                if (settings.characterPresets[charName]) {
                    dataToExport.characters[charName] = settings.characterPresets[charName];
                }
            });

            // 如果导出角色,询问是否也导出服装
            if (allOutfits.size > 0) {
                const confirmOutfits = `同时检测到这些角色包含 ${allOutfits.size} 个不同的服装:\n${Array.from(allOutfits).join('\n')}\n\n是否也一起导出?`;
                const includeOutfits = await stylishConfirm(confirmOutfits);

                if (includeOutfits) {
                    dataToExport.outfits = {};
                    allOutfits.forEach(outfitName => {
                        if (settings.outfitPresets[outfitName]) {
                            dataToExport.outfits[outfitName] = settings.outfitPresets[outfitName];
                        }
                    });
                }
            }
        }
    }

    // 使用统一的加密导出函数
    dataToExport = await encryptExportData(dataToExport);

    const dataStr = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "st-chatu8-角色启用列表-全部.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importCharacterEnablePreset() {
    const settings = extension_settings[extensionName];
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async readerEvent => {
            try {
                let importedData = JSON.parse(readerEvent.target.result);

                // 自动检测并解密数据
                importedData = decryptImportData(importedData);

                // 检查新格式或旧格式
                let enablePresetsToImport = {};
                let charactersToImport = {};
                let outfitsToImport = {};

                if (importedData.characterEnablePresets) {
                    // 新格式
                    enablePresetsToImport = importedData.characterEnablePresets;
                    charactersToImport = importedData.characters || {};
                    outfitsToImport = importedData.outfits || {};
                } else {
                    // 旧格式
                    enablePresetsToImport = importedData;
                }

                // 如果有关联的角色,询问用户是否一起导入
                let importCharacters = false;
                if (Object.keys(charactersToImport).length > 0) {
                    const characterNames = Object.keys(charactersToImport);
                    const confirmMessage = `检测到 ${characterNames.length} 个相关角色:\n${characterNames.join('\n')}\n\n是否一起导入?`;
                    importCharacters = await stylishConfirm(confirmMessage);
                }

                // 导入角色启用预设
                let newEnablePresetsCount = 0;
                for (const key in enablePresetsToImport) {
                    if (enablePresetsToImport.hasOwnProperty(key)) {
                        if (!settings.characterEnablePresets.hasOwnProperty(key)) {
                            newEnablePresetsCount++;
                        }
                        settings.characterEnablePresets[key] = enablePresetsToImport[key];
                    }
                }

                // 导入角色(如果用户确认)
                let newCharactersCount = 0;
                let newOutfitsCount = 0;
                if (importCharacters) {
                    for (const key in charactersToImport) {
                        if (charactersToImport.hasOwnProperty(key)) {
                            if (!settings.characterPresets.hasOwnProperty(key)) {
                                newCharactersCount++;
                            }
                            settings.characterPresets[key] = charactersToImport[key];
                        }
                    }

                    // 同时导入服装
                    for (const key in outfitsToImport) {
                        if (outfitsToImport.hasOwnProperty(key)) {
                            if (!settings.outfitPresets.hasOwnProperty(key)) {
                                newOutfitsCount++;
                            }
                            settings.outfitPresets[key] = outfitsToImport[key];
                        }
                    }
                }

                saveSettingsDebounced();
                loadCharacterEnablePresetList();
                if (importCharacters) {
                    loadCharacterPresetList();
                    loadOutfitPresetList();
                }

                // 自动选择第一个导入的预设
                const firstImportedKey = Object.keys(enablePresetsToImport)[0];
                if (firstImportedKey) {
                    settings.characterEnablePresetId = firstImportedKey;
                    const select = document.getElementById('character_enable_preset_id');
                    if (select) select.value = firstImportedKey;
                    loadCharacterEnablePreset();
                }

                let message = `成功导入 ${Object.keys(enablePresetsToImport).length} 个角色启用预设，其中 ${newEnablePresetsCount} 个是全新的。`;
                if (importCharacters) {
                    message += `\n同时导入 ${Object.keys(charactersToImport).length} 个角色预设(${newCharactersCount} 个全新)`;
                    message += `和 ${Object.keys(outfitsToImport).length} 个服装预设(${newOutfitsCount} 个全新)。`;
                }
                alert(message);
            } catch (err) {
                alert("导入失败，请确保文件是正确的JSON格式。\n错误信息: " + err.message);
                console.error("Error importing character enable presets:", err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

/**
 * 加载角色选择器
 */
export function loadCharacterSelector() {
    const settings = extension_settings[extensionName];
    const select = document.getElementById('character_enable_selector');

    if (!select) return;

    select.innerHTML = '<option value="">-- 选择角色 --</option>';

    // 从角色预设中加载所有角色 - 使用预设名称作为判定
    for (const presetName in settings.characterPresets) {
        const option = document.createElement('option');
        option.value = presetName;
        option.textContent = presetName;
        select.add(option);
    }
}

/**
 * 从选择器添加角色
 */
function addCharacterFromSelector() {
    const select = document.getElementById('character_enable_selector');
    const textarea = document.getElementById('character_enable_list');

    if (!select || !textarea) return;

    const selectedCharacter = select.value;
    if (!selectedCharacter) {
        alert('请先选择一个角色');
        return;
    }

    // 获取当前文本框内容
    const currentText = textarea.value.trim();
    const lines = currentText ? currentText.split('\n') : [];

    // 检查是否已存在
    if (lines.includes(selectedCharacter)) {
        alert('该角色已在列表中');
        return;
    }

    // 添加角色
    lines.push(selectedCharacter);
    textarea.value = lines.join('\n');
}

/**
 * 检测角色列表中的角色是否存在
 */
export function checkCharacterList() {
    const settings = extension_settings[extensionName];
    const textarea = document.getElementById('character_enable_list');
    const resultDiv = document.getElementById('character_enable_check_result');
    const contentDiv = document.getElementById('character_enable_check_content');

    if (!textarea || !resultDiv || !contentDiv) return;

    // 获取输入的角色列表
    const inputCharacters = textarea.value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    if (inputCharacters.length === 0) {
        alert('请先输入角色名称');
        return;
    }

    // 获取所有可用的角色预设名称
    const availableCharacters = new Set();
    for (const presetName in settings.characterPresets) {
        availableCharacters.add(presetName);
    }

    // 检测结果
    const results = {
        found: [],
        notFound: []
    };

    inputCharacters.forEach(char => {
        if (availableCharacters.has(char)) {
            results.found.push(char);
        } else {
            results.notFound.push(char);
        }
    });

    // 显示结果
    let html = '<div style="margin-bottom: 10px;">';
    html += `<strong>总计：</strong>${inputCharacters.length} 个角色`;
    html += `<br><strong>找到：</strong>${results.found.length} 个`;
    html += `<br><strong>未找到：</strong>${results.notFound.length} 个`;
    html += '</div>';

    if (results.found.length > 0) {
        html += '<div style="margin-bottom: 10px;">';
        html += '<strong style="color: #28a745;">✓ 已存在的角色：</strong>';
        html += '<ul style="margin: 5px 0; padding-left: 20px;">';
        results.found.forEach(char => {
            html += `<li>${char}</li>`;
        });
        html += '</ul></div>';
    }

    if (results.notFound.length > 0) {
        html += '<div>';
        html += '<strong style="color: #dc3545;">✗ 未找到的角色：</strong>';
        html += '<ul style="margin: 5px 0; padding-left: 20px;">';
        results.notFound.forEach(char => {
            html += `<li>${char}</li>`;
        });
        html += '</ul></div>';
    }

    contentDiv.innerHTML = html;
    $(resultDiv).show();
}
