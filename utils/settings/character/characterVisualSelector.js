// @ts-nocheck
/**
 * 角色/服装预设可视化选择器模块
 * 
 * 提供可视化的预设选择界面，支持预览图片上传和展示
 */

import { extension_settings } from "../../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../../script.js";
import { extensionName } from '../../config.js';
import { saveConfigImage, getConfigImage, deleteConfigImage } from '../../configDatabase.js';
import { loadCharacterPresetList, loadCharacterPresetData } from './characterPreset.js';
import { loadOutfitPresetList, loadOutfitPresetData } from './outfitPreset.js';

/**
 * 显示角色预设可视化选择器
 * 
 * @param {Function} onSelect - 选择回调函数 (presetName) => void
 */
export async function showCharacterVisualSelector(onSelect) {
    const settings = extension_settings[extensionName];
    await showGenericVisualSelector({
        type: 'character',
        title: '选择角色预设',
        presets: settings.characterPresets || {},
        currentPresetIdKey: 'characterPresetId',
        defaultPresetName: '默认角色',
        imageIdField: 'photoImageIds', // 角色使用 photoImageIds 数组
        settings,
        onSelect,
        onRefresh: () => {
            loadCharacterPresetList();
        },
        loadPresetData: loadCharacterPresetData
    });
}

/**
 * 显示服装预设可视化选择器
 * 
 * @param {Function} onSelect - 选择回调函数 (presetName) => void
 */
export async function showOutfitVisualSelector(onSelect) {
    const settings = extension_settings[extensionName];
    await showGenericVisualSelector({
        type: 'outfit',
        title: '选择服装预设',
        presets: settings.outfitPresets || {},
        currentPresetIdKey: 'outfitPresetId',
        defaultPresetName: '默认服装',
        imageIdField: 'photoImageIds', // 服装也使用 photoImageIds 数组
        settings,
        onSelect,
        onRefresh: () => {
            loadOutfitPresetList();
        },
        loadPresetData: loadOutfitPresetData
    });
}

/**
 * 通用预设可视化选择器
 * 
 * @param {Object} config - 配置对象
 */
async function showGenericVisualSelector(config) {
    const {
        type,
        title,
        presets,
        currentPresetIdKey,
        defaultPresetName,
        imageIdField,
        settings,
        onSelect,
        onRefresh,
        loadPresetData
    } = config;

    const parent = document.getElementById('st-chatu8-settings') || document.body;

    // 创建背景遮罩
    const backdrop = document.createElement('div');
    backdrop.className = 'st-chatu8-workflow-viz-backdrop';

    // 状态
    const selectedForDelete = new Set();
    let isBulkDeleteMode = false;

    // 创建对话框结构
    backdrop.innerHTML = `
        <div class="st-chatu8-workflow-viz-dialog st-chatu8-preset-viz-dialog-wrapper">
            <div class="st-chatu8-workflow-viz-header">
                <h3>${title}</h3>
                <span class="st-chatu8-workflow-viz-close">&times;</span>
            </div>
            <div class="st-chatu8-workflow-viz-toolbar" style="justify-content: space-between; align-items: center; gap: 15px;">
                <div class="st-chatu8-viz-search-container" style="position: relative; flex-grow: 1; max-width: 300px;">
                    <i class="fa-solid fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #aaa; pointer-events: none;"></i>
                    <input type="text" class="st-chatu8-viz-search-input" placeholder="搜索预设..." style="width: 100%; padding: 8px 12px 8px 36px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; color: white; outline: none; transition: all 0.3s;">
                </div>
                <div style="display: flex; gap: 10px;">
                    <div class="st-chatu8-viz-bulk-delete" style="cursor: pointer; padding: 6px 14px; background: rgba(255,255,255,0.1); border-radius: 20px; font-size: 0.9em; user-select: none; white-space: nowrap; display: flex; align-items: center; gap: 6px; transition: all 0.3s;">
                        <i class="fa-solid fa-trash-can"></i> <span>批量删除</span>
                    </div>
                     <div class="st-chatu8-viz-confirm-delete" style="display: none; cursor: pointer; padding: 6px 14px; background: var(--st-chatu8-danger-primary, #d9534f); border-radius: 20px; font-size: 0.9em; user-select: none; white-space: nowrap; align-items: center; gap: 6px; transition: all 0.3s; color: white;">
                        <i class="fa-solid fa-check"></i> <span>确认删除 (0)</span>
                    </div>
                    <div class="st-chatu8-viz-mode-toggle" style="cursor: pointer; padding: 6px 14px; background: rgba(255,255,255,0.1); border-radius: 20px; font-size: 0.9em; user-select: none; white-space: nowrap; display: flex; align-items: center; gap: 6px; transition: all 0.3s;">
                        <i class="fa-solid fa-pen-to-square"></i> <span>管理</span>
                    </div>
                </div>
            </div>
            <div class="st-chatu8-workflow-viz-body">
                <div class="st-chatu8-workflow-viz-container st-chatu8-preset-viz-container">
                    <div class="st-chatu8-preset-grid"></div>
                </div>
            </div>
        </div>
    `;

    // 绑定关闭事件
    const closeBtn = backdrop.querySelector('.st-chatu8-workflow-viz-close');
    closeBtn.onclick = () => parent.removeChild(backdrop);
    backdrop.onclick = (e) => {
        if (e.target === backdrop) {
            parent.removeChild(backdrop);
        }
    };

    // 搜索功能
    const searchInput = backdrop.querySelector('.st-chatu8-viz-search-input');
    searchInput.oninput = (e) => {
        const query = e.target.value.toLowerCase();
        const cards = backdrop.querySelectorAll('.st-chatu8-preset-card');
        cards.forEach(card => {
            const name = card.querySelector('.st-chatu8-preset-card-name').textContent.toLowerCase();
            if (name.includes(query)) {
                card.style.display = 'inline-block';
            } else {
                card.style.display = 'none';
            }
        });
    };

    const wrapper = backdrop.querySelector('.st-chatu8-preset-viz-dialog-wrapper');
    const bulkDeleteBtn = backdrop.querySelector('.st-chatu8-viz-bulk-delete');
    const confirmDeleteBtn = backdrop.querySelector('.st-chatu8-viz-confirm-delete');
    const toggleBtn = backdrop.querySelector('.st-chatu8-viz-mode-toggle');

    // 绑定管理模式切换
    toggleBtn.onclick = () => {
        if (isBulkDeleteMode) {
            exitBulkDeleteMode();
        }
        wrapper.classList.toggle('st-chatu8-mode-manage');
        const isManage = wrapper.classList.contains('st-chatu8-mode-manage');
        toggleBtn.style.background = isManage ? 'var(--st-chatu8-accent-primary)' : 'rgba(255,255,255,0.1)';
        toggleBtn.style.color = isManage ? 'white' : 'inherit';
    };

    // 退出批量删除模式
    function exitBulkDeleteMode() {
        isBulkDeleteMode = false;
        selectedForDelete.clear();
        wrapper.classList.remove('st-chatu8-mode-bulk-delete');
        bulkDeleteBtn.style.background = 'rgba(255,255,255,0.1)';
        bulkDeleteBtn.style.color = 'inherit';
        bulkDeleteBtn.querySelector('span').textContent = '批量删除';
        confirmDeleteBtn.style.display = 'none';
        const cards = backdrop.querySelectorAll('.st-chatu8-preset-card');
        cards.forEach(card => card.classList.remove('selected-for-delete'));
    }

    // 绑定批量删除模式切换
    bulkDeleteBtn.onclick = () => {
        if (wrapper.classList.contains('st-chatu8-mode-manage')) {
            wrapper.classList.remove('st-chatu8-mode-manage');
            toggleBtn.style.background = 'rgba(255,255,255,0.1)';
            toggleBtn.style.color = 'inherit';
        }

        isBulkDeleteMode = !isBulkDeleteMode;

        if (isBulkDeleteMode) {
            wrapper.classList.add('st-chatu8-mode-bulk-delete');
            bulkDeleteBtn.style.background = 'var(--st-chatu8-danger-primary, #d9534f)';
            bulkDeleteBtn.style.color = 'white';
            bulkDeleteBtn.querySelector('span').textContent = '取消删除';
            confirmDeleteBtn.style.display = 'flex';
            updateConfirmButton();
        } else {
            exitBulkDeleteMode();
        }
    };

    function updateConfirmButton() {
        confirmDeleteBtn.querySelector('span').textContent = `确认删除 (${selectedForDelete.size})`;
    }

    // 绑定确认删除
    confirmDeleteBtn.onclick = async () => {
        if (selectedForDelete.size === 0) return;

        if (confirm(`确定要删除选中的 ${selectedForDelete.size} 个预设吗？此操作不可恢复！`)) {
            let deletedCount = 0;
            for (const presetName of selectedForDelete) {
                // 不能删除默认预设
                if (presetName === defaultPresetName) {
                    continue;
                }

                // 删除图片
                const preset = presets[presetName];
                if (preset) {
                    // 处理图片数组
                    const imageIds = preset[imageIdField] || [];
                    for (const imageId of imageIds) {
                        try {
                            await deleteConfigImage(imageId);
                        } catch (e) {
                            console.warn(`Failed to delete image ${imageId} for ${presetName}`);
                        }
                    }
                    // 也处理单独的 previewImageId（兼容旧格式）
                    if (preset.previewImageId) {
                        try {
                            await deleteConfigImage(preset.previewImageId);
                        } catch (e) {
                            console.warn(`Failed to delete preview image for ${presetName}`);
                        }
                    }
                }

                // 删除配置
                if (presets[presetName]) {
                    delete presets[presetName];
                    deletedCount++;
                }

                // 如果删除的是当前选中的，重置为默认
                if (settings[currentPresetIdKey] === presetName) {
                    settings[currentPresetIdKey] = defaultPresetName;
                }
            }

            await saveSettingsDebounced();
            alert(`成功删除 ${deletedCount} 个预设。`);

            // 刷新界面
            exitBulkDeleteMode();
            await refreshGrid();
            if (onRefresh) onRefresh();
        }
    };

    // 刷新网格
    async function refreshGrid() {
        const grid = backdrop.querySelector('.st-chatu8-preset-grid');
        grid.innerHTML = '';

        const presetNames = Object.keys(presets);
        const currentPresetId = settings[currentPresetIdKey];

        for (const presetName of presetNames) {
            const preset = presets[presetName];
            const card = await createPresetCard({
                presetName,
                preset,
                isSelected: presetName === currentPresetId,
                imageIdField,
                defaultPresetName,
                presets,
                settings,
                currentPresetIdKey,
                onCardClick: handleCardClick,
                onRefreshGrid: refreshGrid,
                onRefresh,
                loadPresetData
            });
            grid.appendChild(card);
        }
    }

    // 卡片点击处理函数
    const handleCardClick = (name, cardElement) => {
        if (isBulkDeleteMode) {
            if (name === defaultPresetName) {
                toastr.warning('不能删除默认预设');
                return;
            }
            if (selectedForDelete.has(name)) {
                selectedForDelete.delete(name);
                cardElement.classList.remove('selected-for-delete');
            } else {
                selectedForDelete.add(name);
                cardElement.classList.add('selected-for-delete');
            }
            updateConfirmButton();
        } else {
            // 正常选择模式
            settings[currentPresetIdKey] = name;
            saveSettingsDebounced();
            if (loadPresetData) loadPresetData(name);
            if (onRefresh) onRefresh();
            if (onSelect) onSelect(name);
            parent.removeChild(backdrop);
        }
    };

    parent.appendChild(backdrop);
    await refreshGrid();
}

/**
 * 创建预设卡片
 */
async function createPresetCard(config) {
    const {
        presetName,
        preset,
        isSelected,
        imageIdField,
        defaultPresetName,
        presets,
        settings,
        currentPresetIdKey,
        onCardClick,
        onRefreshGrid,
        onRefresh,
        loadPresetData
    } = config;

    const card = document.createElement('div');
    card.className = 'st-chatu8-preset-card' + (isSelected ? ' selected' : '');

    // 图片容器
    const imageContainer = document.createElement('div');
    imageContainer.className = 'st-chatu8-preset-card-image';

    // 检查是否有预览图（优先使用 photoImageIds 数组的最后一个）
    let previewImageData = null;
    const imageIds = preset?.[imageIdField] || [];
    if (imageIds.length > 0) {
        const latestImageId = imageIds[imageIds.length - 1];
        try {
            previewImageData = await getConfigImage(latestImageId);
        } catch (e) {
            console.warn('加载预设预览图失败:', e);
        }
    }
    // 兼容旧的 previewImageId
    if (!previewImageData && preset?.previewImageId) {
        try {
            previewImageData = await getConfigImage(preset.previewImageId);
        } catch (e) {
            console.warn('加载预设预览图失败:', e);
        }
    }

    if (previewImageData) {
        const img = document.createElement('img');
        img.src = previewImageData;
        img.alt = presetName;
        imageContainer.appendChild(img);
    } else {
        addPlaceholder(imageContainer);
    }

    // 创建操作按钮容器
    const actions = document.createElement('div');
    actions.className = 'st-chatu8-preset-card-actions';

    // 创建上传/编辑按钮
    const uploadBtn = document.createElement('button');
    uploadBtn.className = 'st-chatu8-preset-action-btn';
    uploadBtn.title = '上传/修改预览图';
    uploadBtn.innerHTML = '<i class="fa-solid fa-image"></i>';
    uploadBtn.onclick = (e) => {
        e.stopPropagation();
        handleImageUpload(presetName, presets, imageIdField, imageContainer);
    };
    actions.appendChild(uploadBtn);

    // 如果有图片，显示删除图片按钮
    if (previewImageData) {
        const deleteImgBtn = document.createElement('button');
        deleteImgBtn.className = 'st-chatu8-preset-action-btn danger';
        deleteImgBtn.title = '删除预览图';
        deleteImgBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        deleteImgBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`确定要删除预设 "${presetName}" 的预览图吗？`)) {
                // 删除所有图片
                const ids = preset?.[imageIdField] || [];
                for (const id of ids) {
                    await deleteConfigImage(id);
                }
                if (preset?.previewImageId) {
                    await deleteConfigImage(preset.previewImageId);
                    delete preset.previewImageId;
                }
                preset[imageIdField] = [];
                saveSettingsDebounced();
                refreshCardImage(imageContainer, null);
            }
        };
        actions.appendChild(deleteImgBtn);
    }

    // 重命名预设 (仅管理模式下显示)
    const renameBtn = document.createElement('button');
    renameBtn.className = 'st-chatu8-preset-action-btn';
    renameBtn.title = '重命名预设';
    renameBtn.innerHTML = '<i class="fa-solid fa-pen-nib"></i>';
    renameBtn.onclick = async (e) => {
        e.stopPropagation();
        if (presetName === defaultPresetName) {
            alert('默认预设不能重命名');
            return;
        }
        const newName = prompt(`请输入新的预设名称 (当前: ${presetName}):`, presetName);
        if (newName && newName !== presetName) {
            if (presets[newName]) {
                alert('该名称已存在，请使用其他名称。');
                return;
            }
            presets[newName] = presets[presetName];
            delete presets[presetName];

            if (settings[currentPresetIdKey] === presetName) {
                settings[currentPresetIdKey] = newName;
            }

            // ========== 同步更新启用列表中的角色/服装 ID ==========
            // 更新 characterEnablePresets 中的角色引用
            if (settings.characterEnablePresets) {
                for (const enablePresetId in settings.characterEnablePresets) {
                    const enablePreset = settings.characterEnablePresets[enablePresetId];
                    if (enablePreset.characters && Array.isArray(enablePreset.characters)) {
                        const index = enablePreset.characters.indexOf(presetName);
                        if (index !== -1) {
                            enablePreset.characters[index] = newName;
                            console.log(`[CharacterVisualSelector] 已更新 characterEnablePresets[${enablePresetId}] 中的角色 ID: ${presetName} -> ${newName}`);
                        }
                    }
                }
            }

            // 更新 characterCommonPresets 中的角色引用
            if (settings.characterCommonPresets) {
                for (const commonPresetId in settings.characterCommonPresets) {
                    const commonPreset = settings.characterCommonPresets[commonPresetId];
                    if (commonPreset.characters && Array.isArray(commonPreset.characters)) {
                        const index = commonPreset.characters.indexOf(presetName);
                        if (index !== -1) {
                            commonPreset.characters[index] = newName;
                            console.log(`[CharacterVisualSelector] 已更新 characterCommonPresets[${commonPresetId}] 中的角色 ID: ${presetName} -> ${newName}`);
                        }
                    }
                }
            }

            // 更新 outfitEnablePresets 中的服装引用（如果是服装预设重命名）
            if (settings.outfitEnablePresets) {
                for (const enablePresetId in settings.outfitEnablePresets) {
                    const enablePreset = settings.outfitEnablePresets[enablePresetId];
                    if (enablePreset.outfits && Array.isArray(enablePreset.outfits)) {
                        const index = enablePreset.outfits.indexOf(presetName);
                        if (index !== -1) {
                            enablePreset.outfits[index] = newName;
                            console.log(`[CharacterVisualSelector] 已更新 outfitEnablePresets[${enablePresetId}] 中的服装 ID: ${presetName} -> ${newName}`);
                        }
                    }
                }
            }

            // 更新角色预设中引用的服装列表（如果是服装预设重命名）
            if (settings.characterPresets) {
                for (const charPresetId in settings.characterPresets) {
                    const charPreset = settings.characterPresets[charPresetId];
                    if (charPreset.outfits && Array.isArray(charPreset.outfits)) {
                        const index = charPreset.outfits.indexOf(presetName);
                        if (index !== -1) {
                            charPreset.outfits[index] = newName;
                            console.log(`[CharacterVisualSelector] 已更新 characterPresets[${charPresetId}].outfits 中的服装 ID: ${presetName} -> ${newName}`);
                        }
                    }
                }
            }
            // ========== 同步更新结束 ==========

            saveSettingsDebounced();
            if (onRefresh) onRefresh();
            await onRefreshGrid();
        }
    };
    actions.appendChild(renameBtn);

    // 删除预设 (仅管理模式下显示)
    const deletePresetBtn = document.createElement('button');
    deletePresetBtn.className = 'st-chatu8-preset-action-btn danger';
    deletePresetBtn.title = '删除此预设';
    deletePresetBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deletePresetBtn.onclick = async (e) => {
        e.stopPropagation();
        if (presetName === defaultPresetName) {
            alert('默认预设不能删除');
            return;
        }
        if (confirm(`确定要彻底删除预设 "${presetName}" 吗？此操作不可恢复！`)) {
            // 删除图片
            const ids = preset?.[imageIdField] || [];
            for (const id of ids) {
                await deleteConfigImage(id);
            }
            if (preset?.previewImageId) {
                await deleteConfigImage(preset.previewImageId);
            }
            delete presets[presetName];

            // 检查是否删除的是当前选中的预设
            const isDeletingCurrentPreset = settings[currentPresetIdKey] === presetName;

            if (isDeletingCurrentPreset) {
                // 重置为默认预设
                settings[currentPresetIdKey] = defaultPresetName;
                // 加载默认预设数据
                if (loadPresetData) loadPresetData(defaultPresetName);
            }

            saveSettingsDebounced();
            if (onRefresh) onRefresh();

            // 如果删除的是当前选中的预设，关闭对话框以刷新整个界面
            if (isDeletingCurrentPreset) {
                // 关闭对话框
                const parentElement = card.closest('.st-chatu8-workflow-viz-backdrop');
                if (parentElement && parentElement.parentNode) {
                    parentElement.parentNode.removeChild(parentElement);
                }
            } else {
                await onRefreshGrid();
            }
        }
    };
    actions.appendChild(deletePresetBtn);

    imageContainer.appendChild(actions);
    card.appendChild(imageContainer);

    // 预设名称
    const nameLabel = document.createElement('div');
    nameLabel.className = 'st-chatu8-preset-card-name';
    nameLabel.textContent = presetName;
    card.appendChild(nameLabel);

    // 点击选择
    card.onclick = () => onCardClick(presetName, card);

    return card;
}

/**
 * 添加占位符
 */
function addPlaceholder(container) {
    const placeholder = document.createElement('div');
    placeholder.className = 'st-chatu8-preset-card-placeholder';
    placeholder.innerHTML = '<i class="fa-solid fa-image"></i>';
    container.appendChild(placeholder);
}

/**
 * 刷新卡片图片
 */
async function refreshCardImage(container, imageData) {
    const actions = container.querySelector('.st-chatu8-preset-card-actions');
    container.innerHTML = '';

    if (imageData) {
        const img = document.createElement('img');
        img.src = imageData;
        container.appendChild(img);
    } else {
        addPlaceholder(container);
    }

    if (actions) {
        container.appendChild(actions);
    }
}

/**
 * 处理图片上传
 */
function handleImageUpload(presetName, presets, imageIdField, container) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const reader = new FileReader();
            reader.onload = async (readerEvent) => {
                const base64 = readerEvent.target.result;

                // 保存新图片
                const newImageId = await saveConfigImage(base64, {
                    format: file.type.split('/')[1] || 'png',
                    filename: `preset_${presetName}_preview`
                });

                // 更新预设配置（使用数组）
                if (!presets[presetName]) {
                    presets[presetName] = {};
                }
                if (!presets[presetName][imageIdField]) {
                    presets[presetName][imageIdField] = [];
                }
                presets[presetName][imageIdField].push(newImageId);
                saveSettingsDebounced();

                // 刷新卡片显示
                refreshCardImage(container, base64);
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('上传预览图失败:', error);
            alert('上传预览图失败: ' + error.message);
        }
    };

    input.click();
}
