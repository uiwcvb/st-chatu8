/**
 * 角色和服装prompt处理工具
 * 用于解析和替换prompt中的角色/服装标记
 */


import { extension_settings } from "../../../../extensions.js";
import { extensionName } from './config.js';

/**
 * 标准化名称：统一单引号、移除连字符等，用于匹配比较
 * @param {string} name - 原始名称
 * @returns {string} - 标准化后的名称
 */
function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(/[''`´]/g, "'")  // 统一各种单引号
        .replace(/\s+/g, ' ')     // 统一多个空格为单个
        .trim();
}

/**
 * 处理prompt字符串，替换角色和服装标记
 * @param {string} prompt - 原始prompt字符串
 * @returns {string} - 处理后的prompt字符串
 */
export function processCharacterPrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
        return prompt;
    }

    const defaultCharacterSettings = extension_settings[extensionName];
    console.log('[CharacterPrompt] Processing prompt:', prompt);

    // 获取配置数据
    const characterPresets = defaultCharacterSettings.characterPresets || {};

    const outfitPresets = defaultCharacterSettings.outfitPresets || {};
    const characterEnablePresetId = defaultCharacterSettings.characterEnablePresetId;
    const characterCommonPresetId = defaultCharacterSettings.characterCommonPresetId;
    const outfitEnablePresetId = defaultCharacterSettings.outfitEnablePresetId;

    // 获取启用的角色和通用角色列表
    const enabledCharacters = characterEnablePresetId && defaultCharacterSettings.characterEnablePresets?.[characterEnablePresetId]?.characters || [];
    const commonCharacters = characterCommonPresetId && defaultCharacterSettings.characterCommonPresets?.[characterCommonPresetId]?.characters || [];

    // 获取启用的服装列表
    const enabledOutfits = outfitEnablePresetId && defaultCharacterSettings.outfitEnablePresets?.[outfitEnablePresetId]?.outfits || [];

    // 收集启用角色中的服装列表
    const characterOutfits = enabledCharacters.flatMap(charId => characterPresets[charId]?.outfits || []);

    // 合并所有可用的服装预设ID
    const allAvailableOutfits = [...new Set([...enabledOutfits, ...characterOutfits])];

    // 构建服装名称到预设的映射表（同时支持中英文）
    const outfitNameMap = new Map();
    for (const outfitId of allAvailableOutfits) {
        const outfit = outfitPresets[outfitId];
        if (outfit) {
            // 添加英文名称
            if (outfit.nameEN) {
                const names = outfit.nameEN.split('|');
                for (const name of names) {
                    const trimmedName = name.trim();
                    if (trimmedName) {
                        outfitNameMap.set(trimmedName, outfit);
                    }
                }
            }
            // 添加中文名称
            if (outfit.nameCN) {
                const names = outfit.nameCN.split('|');
                for (const name of names) {
                    const trimmedName = name.trim();
                    if (trimmedName) {
                        outfitNameMap.set(trimmedName, outfit);
                    }
                }
            }
        }
    }

    // 用于在同一次处理中共享镜头角度信息
    let sharedCameraAngle = null;
    let sharedIsFromBehind = false;

    // ========== JSON 格式解析函数 ==========
    const parseJsonFormat = (content) => {
        // 尝试解析 JSON 格式: {"name":"xiao hong", "angle":"from front", "upperBody":"nsfw", "lowerBody":"nsfw"}
        try {
            if (content.startsWith('{') && content.endsWith('}')) {
                const parsed = JSON.parse(content);
                if (parsed.name) {
                    return {
                        isJson: true,
                        hasAngle: 'angle' in parsed,  // 用于区分角色(有angle)和服装(无angle)
                        name: parsed.name,
                        angle: parsed.angle || '',
                        upperBody: parsed.upperBody || 'hidden',  // hidden 表示不处理
                        lowerBody: parsed.lowerBody || 'hidden'   // hidden 表示不处理
                    };
                }
            }
        } catch (e) {
            // 不是 JSON 格式，继续使用旧格式解析
        }
        return { isJson: false };
    };

    const processedPrompt = prompt.replace(/\$([^$]+)\$/g, (match, content) => {
        const trimmedContent = content.trim();

        // ========== 尝试解析 JSON 格式 ==========
        const jsonData = parseJsonFormat(trimmedContent);
        if (jsonData.isJson) {
            const normalizedCharacterName = normalizeName(jsonData.name);
            const cameraAngle = jsonData.angle;
            const isFromBehind = cameraAngle.toLowerCase().includes('from behind');

            // 共享镜头信息
            sharedCameraAngle = cameraAngle;
            sharedIsFromBehind = isFromBehind;

            // 判断上半身和下半身状态
            const upperState = jsonData.upperBody.toLowerCase();
            const lowerState = jsonData.lowerBody.toLowerCase();

            // 通过 hasAngle 区分角色和服装：
            // - 角色有 angle 字段
            // - 服装没有 angle 字段
            if (jsonData.hasAngle) {
                // ========== JSON 角色标记处理 ==========
                let character = null;

                // 辅助函数：通过名称匹配角色
                const matchCharacterByName = (char) => {
                    if (!char) return false;
                    // 匹配英文名称
                    if (char.nameEN) {
                        const names = char.nameEN.split('|').map(name => normalizeName(name));
                        if (names.some(name => name && normalizedCharacterName.includes(name))) {
                            return true;
                        }
                    }
                    // 匹配中文名称
                    if (char.nameCN) {
                        const names = char.nameCN.split('|').map(name => normalizeName(name));
                        if (names.some(name => name && normalizedCharacterName.includes(name))) {
                            return true;
                        }
                    }
                    return false;
                };

                // 优先级1：从 enabledCharacters 中查找
                for (const charId of enabledCharacters) {
                    const char = characterPresets[charId];
                    if (matchCharacterByName(char)) {
                        character = char;
                        console.log('[CharacterPrompt] JSON Character matched from enabledCharacters:', char.nameEN || char.nameCN);
                        break;
                    }
                }

                // 优先级2：从 commonCharacters 中查找
                if (!character) {
                    for (const charId of commonCharacters) {
                        const char = characterPresets[charId];
                        if (matchCharacterByName(char)) {
                            character = char;
                            console.log('[CharacterPrompt] JSON Character matched from commonCharacters:', char.nameEN || char.nameCN);
                            break;
                        }
                    }
                }

                // 优先级3：遍历所有角色预设（兜底，解决 ID 不同步的问题）
                if (!character) {
                    for (const presetId in characterPresets) {
                        const char = characterPresets[presetId];
                        if (matchCharacterByName(char)) {
                            character = char;
                            console.log('[CharacterPrompt] JSON Character matched from all presets (fallback):', char.nameEN || char.nameCN);
                            break;
                        }
                    }
                }

                if (character) {
                    let replacement = '';

                    // 角色特征（100%开启，始终添加）
                    if (character.characterTraits) {
                        replacement = character.characterTraits;
                    }

                    // 处理上半身 (非 hidden 时处理)
                    if (upperState !== 'hidden') {
                        // 先添加面部特征
                        const facialField = isFromBehind ? (character.facialFeaturesBack || '') : (character.facialFeatures || '');
                        if (facialField) replacement += (replacement ? ', ' : '') + facialField;

                        if (upperState === 'sfw') {
                            const field = isFromBehind ? character.upperBodySFWBack : character.upperBodySFW;
                            if (field) replacement += (replacement ? ', ' : '') + field;
                        } else if (upperState === 'nsfw') {
                            const field = isFromBehind ? character.upperBodyNSFWBack : character.upperBodyNSFW;
                            if (field) replacement += (replacement ? ', ' : '') + field;
                        }
                    }

                    // 处理下半身 (非 hidden 时处理)
                    if (lowerState !== 'hidden') {
                        if (lowerState === 'sfw') {
                            const field = isFromBehind ? character.fullBodySFWBack : character.fullBodySFW;
                            if (field) replacement += (replacement ? ', ' : '') + field;
                        } else if (lowerState === 'nsfw') {
                            const field = isFromBehind ? character.fullBodyNSFWBack : character.fullBodyNSFW;
                            if (field) replacement += (replacement ? ', ' : '') + field;
                        }
                    }

                    console.log('[CharacterPrompt] JSON Character replacement result:', replacement);
                    return replacement;
                }
                return match; // 未找到角色则返回原始标记
            } else {
                // ========== JSON 服装标记处理 ==========
                const normalizedOutfitName = normalizeName(jsonData.name);
                let outfit = null;

                // 辅助函数：通过名称匹配服装
                const matchOutfitByName = (outfitPreset) => {
                    if (!outfitPreset) return false;
                    // 匹配英文名称
                    if (outfitPreset.nameEN) {
                        const names = outfitPreset.nameEN.split('|').map(n => normalizeName(n.trim()));
                        if (names.some(name => name && (normalizedOutfitName.includes(name) || name.includes(normalizedOutfitName)))) {
                            return true;
                        }
                    }
                    // 匹配中文名称
                    if (outfitPreset.nameCN) {
                        const names = outfitPreset.nameCN.split('|').map(n => normalizeName(n.trim()));
                        if (names.some(name => name && (normalizedOutfitName.includes(name) || name.includes(normalizedOutfitName)))) {
                            return true;
                        }
                    }
                    return false;
                };

                // 优先级1：从 outfitNameMap（启用列表）中查找
                for (const [name, preset] of outfitNameMap.entries()) {
                    const normalizedPresetName = normalizeName(name);
                    if (normalizedOutfitName.includes(normalizedPresetName) || normalizedPresetName.includes(normalizedOutfitName)) {
                        outfit = preset;
                        console.log('[CharacterPrompt] JSON Outfit matched from outfitNameMap:', name);
                        break;
                    }
                }

                // 优先级2：遍历所有服装预设（兜底，解决 ID 不同步的问题）
                if (!outfit) {
                    for (const presetId in outfitPresets) {
                        const outfitPreset = outfitPresets[presetId];
                        if (matchOutfitByName(outfitPreset)) {
                            outfit = outfitPreset;
                            console.log('[CharacterPrompt] JSON Outfit matched from all presets (fallback):', outfitPreset.nameEN || outfitPreset.nameCN);
                            break;
                        }
                    }
                }

                if (outfit) {
                    let replacement = '';

                    // 处理上半身 (visible 时处理)
                    if (upperState === 'visible') {
                        const field = sharedIsFromBehind ? outfit.upperBodyBack : outfit.upperBody;
                        if (field) replacement = field;
                    }

                    // 处理下半身 (visible 时处理)
                    if (lowerState === 'visible') {
                        const field = sharedIsFromBehind ? outfit.fullBodyBack : outfit.fullBody;
                        if (field) replacement += (replacement ? ', ' : '') + field;
                    }

                    console.log('[CharacterPrompt] JSON Outfit replacement result:', replacement);
                    return replacement;
                }
                return match; // 未找到服装则返回原始标记
            }
        }

        // ========== 旧格式：角色标记处理 ==========
        const characterFormats = [
            { pattern: '-sfw-upperbody-sfw-lowerbody', upper: 'sfw', lower: 'sfw' },
            { pattern: '-sfw-upperbody-nsfw-lowerbody', upper: 'sfw', lower: 'nsfw' },
            { pattern: '-nsfw-upperbody-sfw-lowerbody', upper: 'nsfw', lower: 'sfw' },
            { pattern: '-nsfw-upperbody-nsfw-lowerbody', upper: 'nsfw', lower: 'nsfw' },
            { pattern: '-sfw-upperbody-sfw-fullbody', upper: 'sfw', lower: 'sfw' },
            { pattern: '-sfw-upperbody-nsfw-fullbody', upper: 'sfw', lower: 'nsfw' },
            { pattern: '-nsfw-upperbody-sfw-fullbody', upper: 'nsfw', lower: 'sfw' },
            { pattern: '-nsfw-upperbody-nsfw-fullbody', upper: 'nsfw', lower: 'nsfw' },
            { pattern: '-sfw-upperbody', upper: 'sfw', lower: null },
            { pattern: '-nsfw-upperbody', upper: 'nsfw', lower: null },
            { pattern: '-sfw-lowerbody', upper: null, lower: 'sfw' },
            { pattern: '-nsfw-lowerbody', upper: null, lower: 'nsfw' }
        ];

        for (const format of characterFormats) {
            if (trimmedContent.toLowerCase().endsWith(format.pattern)) {
                const nameAndAngle = trimmedContent.slice(0, -format.pattern.length).trim();
                const normalizedCharacterName = normalizeName(nameAndAngle);
                const cameraAngle = nameAndAngle;
                const isFromBehind = cameraAngle.toLowerCase().includes('from behind');



                // 共享镜头信息
                sharedCameraAngle = cameraAngle;
                sharedIsFromBehind = isFromBehind;

                let character = null;

                // 辅助函数：通过名称匹配角色
                const matchCharacterByName = (char) => {
                    if (!char) return false;
                    // 匹配英文名称
                    if (char.nameEN) {
                        const names = char.nameEN.split('|').map(name => normalizeName(name));
                        if (names.some(name => name && normalizedCharacterName.includes(name))) {
                            return true;
                        }
                    }
                    // 匹配中文名称
                    if (char.nameCN) {
                        const names = char.nameCN.split('|').map(name => normalizeName(name));
                        if (names.some(name => name && normalizedCharacterName.includes(name))) {
                            return true;
                        }
                    }
                    return false;
                };

                // 优先级1：从 enabledCharacters 中查找
                for (const charId of enabledCharacters) {
                    const char = characterPresets[charId];
                    if (matchCharacterByName(char)) {
                        character = char;
                        console.log('[CharacterPrompt] Old format Character matched from enabledCharacters:', char.nameEN || char.nameCN);
                        break;
                    }
                }

                // 优先级2：从 commonCharacters 中查找
                if (!character) {
                    for (const charId of commonCharacters) {
                        const char = characterPresets[charId];
                        if (matchCharacterByName(char)) {
                            character = char;
                            console.log('[CharacterPrompt] Old format Character matched from commonCharacters:', char.nameEN || char.nameCN);
                            break;
                        }
                    }
                }

                // 优先级3：遍历所有角色预设（兜底，解决 ID 不同步的问题）
                if (!character) {
                    for (const presetId in characterPresets) {
                        const char = characterPresets[presetId];
                        if (matchCharacterByName(char)) {
                            character = char;
                            console.log('[CharacterPrompt] Old format Character matched from all presets (fallback):', char.nameEN || char.nameCN);
                            break;
                        }
                    }
                }

                if (character) {
                    let replacement = '';

                    // 角色特征（100%开启，始终添加）
                    if (character.characterTraits) {
                        replacement = character.characterTraits;
                    }

                    if (format.upper) {
                        const facialField = isFromBehind ? (character.facialFeaturesBack || '') : (character.facialFeatures || '');
                        if (facialField) replacement += (replacement ? ', ' : '') + facialField;
                    }
                    if (format.upper === 'sfw') {
                        const field = isFromBehind ? character.upperBodySFWBack : character.upperBodySFW;
                        if (field) replacement += (replacement ? ', ' : '') + field;
                    } else if (format.upper === 'nsfw') {
                        const field = isFromBehind ? character.upperBodyNSFWBack : character.upperBodyNSFW;
                        if (field) replacement += (replacement ? ', ' : '') + field;
                    }
                    if (format.lower === 'sfw') {
                        const field = isFromBehind ? character.fullBodySFWBack : character.fullBodySFW;
                        if (field) replacement += (replacement ? ', ' : '') + field;
                    } else if (format.lower === 'nsfw') {
                        const field = isFromBehind ? character.fullBodyNSFWBack : character.fullBodyNSFW;
                        if (field) replacement += (replacement ? ', ' : '') + field;
                    }
                    console.log('[CharacterPrompt] Character replacement result:', replacement);
                    return replacement;
                }
                return match; // 未找到角色则返回原始标记
            }
        }

        // ========== 服装标记处理 ==========
        const outfitFormats = [
            { pattern: '-upperbody-lowerbody', hasUpper: true, hasLower: true },
            { pattern: '-upperbody', hasUpper: true, hasLower: false },
            { pattern: '-lowerbody', hasUpper: false, hasLower: true }
        ];

        for (const format of outfitFormats) {
            if (trimmedContent.toLowerCase().endsWith(format.pattern)) {
                const rawOutfitName = trimmedContent.slice(0, -format.pattern.length).trim();
                const normalizedOutfitName = normalizeName(rawOutfitName);

                // 辅助函数：通过名称匹配服装
                const matchOutfitByName = (outfitPreset) => {
                    if (!outfitPreset) return false;
                    // 匹配英文名称
                    if (outfitPreset.nameEN) {
                        const names = outfitPreset.nameEN.split('|').map(n => normalizeName(n.trim()));
                        if (names.some(name => name && (normalizedOutfitName.includes(name) || name.includes(normalizedOutfitName)))) {
                            return true;
                        }
                    }
                    // 匹配中文名称
                    if (outfitPreset.nameCN) {
                        const names = outfitPreset.nameCN.split('|').map(n => normalizeName(n.trim()));
                        if (names.some(name => name && (normalizedOutfitName.includes(name) || name.includes(normalizedOutfitName)))) {
                            return true;
                        }
                    }
                    return false;
                };

                let outfit = null;

                // 优先级1：从 outfitNameMap（启用列表）中查找
                for (const [name, preset] of outfitNameMap.entries()) {
                    const normalizedPresetName = normalizeName(name);
                    if (normalizedOutfitName.includes(normalizedPresetName) || normalizedPresetName.includes(normalizedOutfitName)) {
                        outfit = preset;
                        console.log('[CharacterPrompt] Old format Outfit matched from outfitNameMap:', name);
                        break;
                    }
                }

                // 优先级2：遍历所有服装预设（兜底，解决 ID 不同步的问题）
                if (!outfit) {
                    for (const presetId in outfitPresets) {
                        const outfitPreset = outfitPresets[presetId];
                        if (matchOutfitByName(outfitPreset)) {
                            outfit = outfitPreset;
                            console.log('[CharacterPrompt] Old format Outfit matched from all presets (fallback):', outfitPreset.nameEN || outfitPreset.nameCN);
                            break;
                        }
                    }
                }

                if (outfit) {
                    let replacement = '';
                    if (format.hasUpper) {
                        const field = sharedIsFromBehind ? outfit.upperBodyBack : outfit.upperBody;
                        if (field) replacement = field;
                    }
                    if (format.hasLower) {
                        const field = sharedIsFromBehind ? outfit.fullBodyBack : outfit.fullBody;
                        if (field) replacement += (replacement ? ', ' : '') + field;
                    }
                    console.log('[CharacterPrompt] Outfit replacement result:', replacement);
                    return replacement;
                }
                return match; // 未找到服装则返回原始标记
            }
        }

        // 如果不匹配任何已知格式，返回原始标记
        return match;
    });

    // 清理多余的逗号和空格
    return processedPrompt.replace(/, \s*,/g, ',').replace(/,+/g, ',').replace(/^, |, $/g, '').trim();
}

/**
 * 批量处理多个prompt
 * @param {string[]} prompts - prompt数组
 * @returns {string[]} - 处理后的prompt数组
 */
export function processCharacterPrompts(prompts) {
    if (!Array.isArray(prompts)) {
        return prompts;
    }

    return prompts.map(prompt => processCharacterPrompt(prompt));
}
