import { extension_settings } from "../../../../../extensions.js";
import { saveSettingsDebounced, eventSource } from "../../../../../../script.js";
import { extensionName, eventNames } from "../config.js";
import { recordGesture, initGestureMonitor, stopGestureMonitor } from "./Drawing.js";
import { initClickTriggerMonitor, stopClickTriggerMonitor } from "./ClickTrigger.js";
import { addLog, clearLog } from '../utils.js';

// DOM Elements
let profileSelect, beforeAfterEditor, textEditor, originalText, resultText, regexTestModeSwitch, gestureEnabledSwitch, clickTriggerEnabledSwitch, gestureShowRecognitionSwitch, gestureShowTrailSwitch, gestureTrailColorPicker, gestureMatchThresholdSlider, gestureMatchThresholdValue, imageGenDemandEnabledSwitch, defaultCharDemandTextarea, defaultImageDemandTextarea;

// 正则预设编辑器 DOM 元素
let regexEntriesContainer;
let regexEntryIdCounter = 0;
let currentEditingRegexEntry = null;

// ==================== 正则条目数据结构 ====================

/**
 * 默认正则条目值
 */
const DEFAULT_REGEX_ENTRY = {
    id: '',
    scriptName: '新建正则',
    disabled: false,
    runOnEdit: true,
    findRegex: '',
    replaceString: '',
    trimStrings: [],
    placement: [2],
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
    markdownOnly: true,
    promptOnly: false
};

/**
 * 生成唯一的正则条目 ID
 * @returns {string} 唯一 ID
 */
function generateRegexEntryId() {
    return `regex_entry_${Date.now()}_${++regexEntryIdCounter}`;
}

/**
 * 创建新的正则条目（带默认值）
 * @returns {object} 新的正则条目对象
 */
function createNewRegexEntry() {
    return {
        ...DEFAULT_REGEX_ENTRY,
        id: generateRegexEntryId()
    };
}

/**
 * 从 ST 正则格式解析为内部条目格式
 * @param {object} json - ST 正则 JSON 对象
 * @returns {object|null} 解析后的条目对象，无效则返回 null
 */
function parseSTRegexFormat(json) {
    if (!json || typeof json !== 'object') {
        return null;
    }

    // 必须有 findRegex 字段
    if (typeof json.findRegex !== 'string') {
        return null;
    }

    return {
        id: json.id || generateRegexEntryId(),
        scriptName: json.scriptName || '导入的正则',
        disabled: json.disabled === true,
        runOnEdit: json.runOnEdit !== false,
        findRegex: json.findRegex || '',
        replaceString: json.replaceString || '',
        trimStrings: Array.isArray(json.trimStrings) ? json.trimStrings : [],
        placement: Array.isArray(json.placement) ? json.placement : [2],
        substituteRegex: typeof json.substituteRegex === 'number' ? json.substituteRegex : 0,
        minDepth: json.minDepth ?? null,
        maxDepth: json.maxDepth ?? null,
        markdownOnly: json.markdownOnly !== false,
        promptOnly: json.promptOnly === true
    };
}

/**
 * 导出条目为 ST 正则格式
 * @param {object} entry - 内部条目对象
 * @returns {object} ST 正则格式的 JSON 对象
 */
function exportToSTRegexFormat(entry) {
    return {
        id: entry.id || generateRegexEntryId(),
        scriptName: entry.scriptName || '未命名正则',
        disabled: entry.disabled === true,
        runOnEdit: entry.runOnEdit !== false,
        findRegex: entry.findRegex || '',
        replaceString: entry.replaceString || '',
        trimStrings: Array.isArray(entry.trimStrings) ? entry.trimStrings : [],
        placement: Array.isArray(entry.placement) ? entry.placement : [2],
        substituteRegex: typeof entry.substituteRegex === 'number' ? entry.substituteRegex : 0,
        minDepth: entry.minDepth ?? null,
        maxDepth: entry.maxDepth ?? null,
        markdownOnly: entry.markdownOnly !== false,
        promptOnly: entry.promptOnly === true
    };
}

/**
 * 验证正则条目数据是否有效
 * @param {object} entry - 条目对象
 * @returns {boolean} 是否有效
 */
function validateRegexEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return false;
    }
    if (typeof entry.findRegex !== 'string') {
        return false;
    }
    if (typeof entry.scriptName !== 'string') {
        return false;
    }
    return true;
}

// ==================== 正则条目编辑弹窗 ====================

/**
 * 获取正则条目编辑弹窗 HTML 模板
 * @returns {string} 弹窗 HTML
 */
function getRegexEntryEditModalHTML() {
    return `
        <div class="st-chatu8-entry-edit-modal-backdrop" id="ch-regex-entry-edit-modal">
            <div class="st-chatu8-entry-edit-modal">
                <div class="st-chatu8-entry-edit-modal-header">
                    <h4>编辑正则条目</h4>
                    <span class="st-chatu8-entry-edit-modal-close">&times;</span>
                </div>
                <div class="st-chatu8-entry-edit-modal-body">
                    <div class="st-chatu8-modal-field">
                        <label>脚本名称</label>
                        <input type="text" id="ch-regex-modal-script-name" class="st-chatu8-text-input" placeholder="脚本名称" />
                    </div>
                    <div class="st-chatu8-modal-field st-chatu8-modal-toggle-field">
                        <label>启用</label>
                        <div class="st-chatu8-toggle">
                            <input id="ch-regex-modal-enabled" type="checkbox" checked />
                            <span class="st-chatu8-slider"></span>
                        </div>
                    </div>
                    <div class="st-chatu8-modal-field">
                        <label>查找正则 (findRegex)</label>
                        <textarea id="ch-regex-modal-find-regex" class="st-chatu8-textarea" rows="4" placeholder="输入正则表达式..."></textarea>
                    </div>
                    <div class="st-chatu8-modal-field">
                        <label>替换字符串 (replaceString)</label>
                        <textarea id="ch-regex-modal-replace-string" class="st-chatu8-textarea" rows="4" placeholder="输入替换字符串..."></textarea>
                    </div>
                </div>
                <div class="st-chatu8-entry-edit-modal-footer">
                    <button class="st-chatu8-btn st-chatu8-modal-cancel-btn">取消</button>
                    <button class="st-chatu8-btn st-chatu8-btn-primary st-chatu8-modal-save-btn">保存</button>
                </div>
            </div>
        </div>
    `;
}

// ==================== 正则条目列表渲染 ====================

/**
 * HTML 转义
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeHtmlForRegex(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 渲染正则条目列表
 * @param {Array} entriesData - 条目数组
 */
function renderRegexEntries(entriesData = []) {
    if (!regexEntriesContainer) return;

    regexEntriesContainer.empty();

    if (entriesData.length === 0) {
        regexEntriesContainer.html(`
            <div class="st-chatu8-entries-empty">
                <i class="fa-solid fa-inbox"></i>
                <p>暂无正则条目，点击上方按钮添加</p>
            </div>
        `);
        return;
    }

    entriesData.forEach((entry, index) => {
        addRegexEntryDOM(entry, index);
    });
}

/**
 * 创建并添加单个正则条目 DOM 元素
 * @param {object} entry - 条目数据
 * @param {number} index - 索引
 */
function addRegexEntryDOM(entry, index = -1) {
    const entryId = entry.id || generateRegexEntryId();
    const scriptName = entry.scriptName || `正则 ${index + 1}`;
    const findRegex = entry.findRegex || '';
    const replaceString = entry.replaceString || '';
    const entryDisabled = entry.disabled === true;

    const disabledClass = entryDisabled ? 'disabled' : '';
    const regexPreview = findRegex.length > 40 ? findRegex.substring(0, 40) + '...' : (findRegex || '(空)');

    // Warning indicator for long replaceString (> 100 characters)
    const hasLongReplaceString = replaceString.length > 100;
    const warningHtml = hasLongReplaceString
        ? `<span class="st-chatu8-entry-warning" title="替换字符串超过100字符 (${replaceString.length}字符)"><i class="fa-solid fa-triangle-exclamation"></i></span>`
        : '';

    const entryElement = $(`
        <div class="st-chatu8-preset-entry st-chatu8-preset-entry-collapsed ${disabledClass}" 
             data-entry-id="${entryId}" 
             data-find-regex="${escapeHtmlForRegex(findRegex)}"
             data-replace-string="${escapeHtmlForRegex(replaceString)}"
             draggable="true">
            <div class="st-chatu8-entry-header">
                <span class="st-chatu8-entry-drag-handle" title="拖拽排序">
                    <i class="fa-solid fa-grip-vertical"></i>
                </span>
                <span class="st-chatu8-entry-role-badge" data-role="regex">REG</span>
                <input type="text" class="st-chatu8-entry-name" value="${escapeHtmlForRegex(scriptName)}" placeholder="脚本名称" readonly />
                ${warningHtml}
                <span class="st-chatu8-entry-preview">${escapeHtmlForRegex(regexPreview)}</span>
                <div class="st-chatu8-entry-actions">
                    <div class="st-chatu8-entry-toggle" title="启用/禁用">
                        <input type="checkbox" ${!entryDisabled ? 'checked' : ''} />
                        <span class="st-chatu8-slider"></span>
                    </div>
                    <button class="st-chatu8-icon-btn st-chatu8-entry-edit" title="编辑">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="st-chatu8-icon-btn st-chatu8-entry-export" title="导出">
                        <i class="fa-solid fa-file-export"></i>
                    </button>
                    <button class="st-chatu8-icon-btn danger st-chatu8-entry-delete" title="删除条目">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `);

    // 存储完整数据到 DOM 元素
    entryElement.data('entryData', entry);

    regexEntriesContainer.append(entryElement);
}

// ==================== 正则条目编辑弹窗功能 ====================

/**
 * 显示正则条目编辑弹窗
 * @param {jQuery} $entryElement - 条目元素
 */
function showRegexEntryEditModal($entryElement) {
    currentEditingRegexEntry = $entryElement;

    // 如果弹窗不存在，先创建
    let $modal = $('#ch-regex-entry-edit-modal');
    if (!$modal.length) {
        $('body').append(getRegexEntryEditModalHTML());
        $modal = $('#ch-regex-entry-edit-modal');

        // 绑定弹窗事件
        $modal.find('.st-chatu8-entry-edit-modal-close').on('click', closeRegexEntryEditModal);
        $modal.find('.st-chatu8-modal-cancel-btn').on('click', closeRegexEntryEditModal);
        $modal.find('.st-chatu8-modal-save-btn').on('click', saveRegexEntryFromModal);
    }

    // 获取条目数据
    const entryData = $entryElement.data('entryData') || {};

    // 填充数据到弹窗
    $modal.find('#ch-regex-modal-script-name').val(entryData.scriptName || $entryElement.find('.st-chatu8-entry-name').val());
    $modal.find('#ch-regex-modal-enabled').prop('checked', !$entryElement.hasClass('disabled'));
    $modal.find('#ch-regex-modal-find-regex').val(entryData.findRegex || '');
    $modal.find('#ch-regex-modal-replace-string').val(entryData.replaceString || '');

    // 显示弹窗
    $modal.fadeIn(200);
}

/**
 * 关闭正则条目编辑弹窗
 */
function closeRegexEntryEditModal() {
    const $modal = $('#ch-regex-entry-edit-modal');
    $modal.fadeOut(200);
    currentEditingRegexEntry = null;
}

/**
 * 从弹窗保存数据到正则条目
 */
function saveRegexEntryFromModal() {
    if (!currentEditingRegexEntry) {
        closeRegexEntryEditModal();
        return;
    }

    const $modal = $('#ch-regex-entry-edit-modal');
    const $entry = currentEditingRegexEntry;

    // 获取弹窗数据
    const scriptName = $modal.find('#ch-regex-modal-script-name').val() || '未命名正则';
    const enabled = $modal.find('#ch-regex-modal-enabled').is(':checked');
    const findRegex = $modal.find('#ch-regex-modal-find-regex').val() || '';
    const replaceString = $modal.find('#ch-regex-modal-replace-string').val() || '';

    // 获取现有数据并更新
    const entryData = $entry.data('entryData') || {};
    entryData.scriptName = scriptName;
    entryData.disabled = !enabled;
    entryData.findRegex = findRegex;
    entryData.replaceString = replaceString;

    // 更新 DOM 显示
    $entry.find('.st-chatu8-entry-name').val(scriptName);
    $entry.attr('data-find-regex', findRegex);
    $entry.attr('data-replace-string', replaceString);

    // 更新启用状态
    $entry.find('.st-chatu8-entry-toggle input').prop('checked', enabled);
    if (enabled) {
        $entry.removeClass('disabled');
    } else {
        $entry.addClass('disabled');
    }

    // 更新预览
    const regexPreview = findRegex.length > 40 ? findRegex.substring(0, 40) + '...' : (findRegex || '(空)');
    $entry.find('.st-chatu8-entry-preview').text(regexPreview);

    // 更新 replaceString 长度警告指示器
    const hasLongReplaceString = replaceString.length > 100;
    $entry.find('.st-chatu8-entry-warning').remove(); // 移除旧的警告
    if (hasLongReplaceString) {
        const warningHtml = `<span class="st-chatu8-entry-warning" title="替换字符串超过100字符 (${replaceString.length}字符)"><i class="fa-solid fa-triangle-exclamation"></i></span>`;
        $entry.find('.st-chatu8-entry-name').after(warningHtml);
    }

    // 保存数据
    $entry.data('entryData', entryData);

    toastr.success('正则条目已更新');
    closeRegexEntryEditModal();

    // 保存到设置
    saveRegexEntriesToProfile();
}

// ==================== 正则条目 CRUD 操作 ====================

/**
 * 添加新的正则条目
 */
function addNewRegexEntry() {
    // 移除空状态提示
    if (regexEntriesContainer) {
        regexEntriesContainer.find('.st-chatu8-entries-empty').remove();
    }

    const newEntry = createNewRegexEntry();
    addRegexEntryDOM(newEntry);

    // 滚动到新添加的条目
    if (regexEntriesContainer && regexEntriesContainer[0]) {
        const container = regexEntriesContainer[0];
        container.scrollTop = container.scrollHeight;
    }

    // 自动打开编辑弹窗
    const $newEntry = regexEntriesContainer.find('.st-chatu8-preset-entry').last();
    showRegexEntryEditModal($newEntry);
}

/**
 * 删除正则条目
 * @param {jQuery} $entryElement - 条目元素
 */
function deleteRegexEntry($entryElement) {
    $entryElement.remove();
    toastr.info('已删除正则条目');

    // 如果删除后没有条目了，显示空状态
    const $entries = regexEntriesContainer.find('.st-chatu8-preset-entry');
    if ($entries.length === 0) {
        regexEntriesContainer.html(`
            <div class="st-chatu8-entries-empty">
                <i class="fa-solid fa-inbox"></i>
                <p>暂无正则条目，点击上方按钮添加</p>
            </div>
        `);
    }

    saveRegexEntriesToProfile();
}

/**
 * 切换正则条目启用状态
 * @param {jQuery} $entryElement - 条目元素
 * @param {boolean} enabled - 是否启用
 */
function toggleRegexEntry($entryElement, enabled) {
    const entryData = $entryElement.data('entryData') || {};
    entryData.disabled = !enabled;
    $entryElement.data('entryData', entryData);

    if (enabled) {
        $entryElement.removeClass('disabled');
    } else {
        $entryElement.addClass('disabled');
    }

    saveRegexEntriesToProfile();
}

/**
 * 导出单个正则条目
 * @param {jQuery} $entryElement - 条目元素
 */
function exportRegexEntry($entryElement) {
    const entryData = $entryElement.data('entryData');
    if (!entryData) {
        toastr.warning('无法导出：条目数据不存在');
        return;
    }

    const exportData = exportToSTRegexFormat(entryData);
    const scriptName = entryData.scriptName || '未命名正则';
    const safeFileName = scriptName.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');

    const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `st_regex_${safeFileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toastr.success(`已导出正则条目: ${scriptName}`);
}

// ==================== 正则条目导入功能 ====================

/**
 * 导入正则条目（从 JSON 文件）
 */
function importRegexEntries() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;
    input.onchange = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        let importedCount = 0;
        const readPromises = [];

        for (const file of files) {
            const promise = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        const entry = parseSTRegexFormat(data);
                        if (entry && validateRegexEntry(entry)) {
                            // 移除空状态提示
                            regexEntriesContainer.find('.st-chatu8-entries-empty').remove();
                            addRegexEntryDOM(entry);
                            importedCount++;
                        }
                    } catch (error) {
                        console.warn(`解析文件 ${file.name} 失败:`, error);
                    }
                    resolve();
                };
                reader.onerror = () => resolve();
                reader.readAsText(file);
            });
            readPromises.push(promise);
        }

        await Promise.all(readPromises);

        if (importedCount > 0) {
            saveRegexEntriesToProfile();
            toastr.success(`成功导入 ${importedCount} 个正则条目`);
        } else {
            toastr.warning('没有有效的正则条目可导入');
        }
    };
    input.click();
}

/**
 * 从 ST 正则引擎导入条目
 */
async function importRegexEntriesFromEngine() {
    let regexEngine;
    try {
        regexEngine = await import('../../../../../extensions/regex/engine.js');
    } catch (importError) {
        console.error('无法加载正则引擎模块:', importError);
        toastr.error('无法加载ST正则引擎模块，请确保正则扩展已启用');
        return;
    }

    try {
        // 检查必需的函数和常量是否存在（兼容性检测）
        if (typeof regexEngine.getScriptsByType !== 'function') {
            toastr.error('ST正则引擎版本过旧，缺少 getScriptsByType 函数。\n请更新 SillyTavern 到最新版本。');
            console.warn('regexEngine 对象缺少 getScriptsByType 函数。可用的导出:', Object.keys(regexEngine));
            return;
        }
        if (!regexEngine.SCRIPT_TYPES) {
            toastr.error('ST正则引擎版本过旧，缺少 SCRIPT_TYPES 常量。\n请更新 SillyTavern 到最新版本。');
            console.warn('regexEngine 对象缺少 SCRIPT_TYPES 常量。可用的导出:', Object.keys(regexEngine));
            return;
        }

        const globalScripts = regexEngine.getScriptsByType(regexEngine.SCRIPT_TYPES.GLOBAL) || [];
        const scopedScripts = regexEngine.getScriptsByType(regexEngine.SCRIPT_TYPES.SCOPED) || [];
        const presetScripts = regexEngine.getScriptsByType(regexEngine.SCRIPT_TYPES.PRESET) || [];

        // 过滤条件：
        // 1. 未禁用
        // 2. 有 findRegex
        // 3. minDepth === 0 或 null 或 undefined
        // 4. markdownOnly === true
        // 5. placement 包含 2
        const filterScripts = (scripts) => scripts.filter(script => {
            if (script.disabled) return false;
            if (!script.findRegex) return false;

            const minDepthValid = script.minDepth === 0 || script.minDepth === null || script.minDepth === undefined;
            const markdownOnlyValid = script.markdownOnly === true;
            const placementValid = Array.isArray(script.placement) && script.placement.includes(2);

            return minDepthValid && markdownOnlyValid && placementValid;
        });

        const scriptsByType = {
            global: filterScripts(globalScripts),
            scoped: filterScripts(scopedScripts),
            preset: filterScripts(presetScripts)
        };

        const totalCount = scriptsByType.global.length + scriptsByType.scoped.length + scriptsByType.preset.length;

        if (totalCount === 0) {
            toastr.warning('没有符合条件的正则脚本可导入。\n条件: 未禁用, minDepth=0或null, markdownOnly=true, placement包含2');
            return;
        }

        // 显示选择对话框（复用现有的）
        const selectedScripts = await showRegexEntrySelectionDialog(scriptsByType);

        if (selectedScripts.length > 0) {
            // 移除空状态提示
            regexEntriesContainer.find('.st-chatu8-entries-empty').remove();

            selectedScripts.forEach(script => {
                const entry = parseSTRegexFormat(script);
                if (entry) {
                    addRegexEntryDOM(entry);
                }
            });

            saveRegexEntriesToProfile();
            toastr.success(`成功导入 ${selectedScripts.length} 个正则条目`);
        } else {
            toastr.info('未选择任何正则脚本');
        }
    } catch (error) {
        console.error('加载正则引擎模块失败:', error);
        toastr.error('加载ST正则引擎模块失败，请确保正则扩展已启用');
    }
}

/**
 * 获取正则条目导入选择弹窗 HTML 模板
 * @param {string} listHtml - 条目列表 HTML
 * @returns {string} 弹窗 HTML
 */
function getRegexEntryImportModalHTML(listHtml) {
    return `
        <div class="st-chatu8-entry-edit-modal-backdrop" id="ch-regex-entry-import-modal">
            <div class="st-chatu8-entry-edit-modal">
                <div class="st-chatu8-entry-edit-modal-header">
                    <h4>选择要导入的正则条目</h4>
                    <span class="st-chatu8-entry-edit-modal-close">&times;</span>
                </div>
                <div class="st-chatu8-entry-edit-modal-body">
                    <div class="st-chatu8-modal-field st-chatu8-import-toolbar">
                        <button type="button" class="st-chatu8-btn" id="st-regex-entry-select-all">
                            <i class="fa-solid fa-check-double"></i> 全选
                        </button>
                        <button type="button" class="st-chatu8-btn" id="st-regex-entry-deselect-all">
                            <i class="fa-solid fa-xmark"></i> 取消全选
                        </button>
                    </div>
                    <div class="st-chatu8-modal-field st-chatu8-import-list">
                        ${listHtml}
                    </div>
                </div>
                <div class="st-chatu8-entry-edit-modal-footer">
                    <button class="st-chatu8-btn st-chatu8-modal-cancel-btn">取消</button>
                    <button class="st-chatu8-btn st-chatu8-btn-primary st-chatu8-modal-save-btn">
                        <i class="fa-solid fa-file-import"></i> 导入选中
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * 显示正则条目选择对话框（用于从引擎导入）
 * @param {Object} scriptsByType - 按类型分组的脚本
 * @returns {Promise<Array>} - 选中的完整脚本对象数组
 */
function showRegexEntrySelectionDialog(scriptsByType) {
    return new Promise((resolve) => {
        const typeLabels = {
            global: '全局正则',
            scoped: '角色正则',
            preset: '预设正则'
        };

        let listHtml = '';
        for (const [type, scripts] of Object.entries(scriptsByType)) {
            if (scripts.length === 0) continue;

            listHtml += `
                <div class="st-chatu8-import-type-group">
                    <h5 class="st-chatu8-import-type-header">${typeLabels[type] || type} <span class="st-chatu8-import-count">(${scripts.length})</span></h5>
            `;

            scripts.forEach((script, index) => {
                const scriptId = `st-regex-entry-${type}-${index}`;
                const scriptName = script.scriptName || `未命名正则 ${index + 1}`;
                listHtml += `
                    <div class="st-chatu8-import-item">
                        <label class="st-chatu8-import-label">
                            <input type="checkbox" class="st-chatu8-import-checkbox" id="${scriptId}" 
                                   data-type="${type}" data-index="${index}" checked>
                            <span class="st-chatu8-import-name">${escapeHtmlForRegex(scriptName)}</span>
                        </label>
                    </div>
                `;
            });

            listHtml += `</div>`;
        }

        // 如果弹窗已存在，先移除
        $('#ch-regex-entry-import-modal').remove();

        $('body').append(getRegexEntryImportModalHTML(listHtml));
        const $modal = $('#ch-regex-entry-import-modal');

        // 全选/取消全选
        $modal.find('#st-regex-entry-select-all').on('click', () => {
            $modal.find('.st-chatu8-import-checkbox').prop('checked', true);
        });
        $modal.find('#st-regex-entry-deselect-all').on('click', () => {
            $modal.find('.st-chatu8-import-checkbox').prop('checked', false);
        });

        // 确认导入
        $modal.find('.st-chatu8-modal-save-btn').on('click', () => {
            const selectedScripts = [];
            $modal.find('.st-chatu8-import-checkbox:checked').each(function () {
                const type = $(this).data('type');
                const index = $(this).data('index');
                const script = scriptsByType[type][index];
                if (script) {
                    selectedScripts.push(script);
                }
            });
            $modal.fadeOut(200, () => $modal.remove());
            resolve(selectedScripts);
        });

        // 取消/关闭
        $modal.find('.st-chatu8-modal-cancel-btn, .st-chatu8-entry-edit-modal-close').on('click', () => {
            $modal.fadeOut(200, () => $modal.remove());
            resolve([]);
        });

        // 点击遮罩关闭
        $modal.on('click', (e) => {
            if ($(e.target).hasClass('st-chatu8-entry-edit-modal-backdrop')) {
                $modal.fadeOut(200, () => $modal.remove());
                resolve([]);
            }
        });

        // 显示弹窗
        $modal.fadeIn(200);
    });
}

// ==================== 正则条目数据持久化 ====================

/**
 * 从 UI 收集所有正则条目数据
 * @returns {Array} 条目数组
 */
function collectRegexEntriesFromUI() {
    const entries = [];
    if (!regexEntriesContainer) return entries;

    regexEntriesContainer.find('.st-chatu8-preset-entry').each(function () {
        const $entry = $(this);
        const entryData = $entry.data('entryData');
        if (entryData) {
            entries.push(entryData);
        }
    });

    return entries;
}

/**
 * 保存正则条目到当前配置
 */
function saveRegexEntriesToProfile() {
    const profileName = profileSelect.val();
    if (!profileName) return;

    const profiles = extension_settings[extensionName].regex_profiles;
    if (!profiles[profileName]) {
        profiles[profileName] = {};
    }

    profiles[profileName].regexEntries = collectRegexEntriesFromUI();
    saveSettingsDebounced();
}

/**
 * 从配置加载正则条目
 */
function loadRegexEntriesFromProfile() {
    const profileName = profileSelect.val();
    if (!profileName) return;

    const profiles = extension_settings[extensionName].regex_profiles;
    const profile = profiles[profileName];

    if (profile && Array.isArray(profile.regexEntries)) {
        renderRegexEntries(profile.regexEntries);
    } else {
        renderRegexEntries([]);
    }
}

// ==================== 正则条目事件绑定 ====================

/**
 * 绑定正则条目拖拽事件
 */
function bindRegexEntryDragEvents() {
    if (!regexEntriesContainer) return;

    let draggedEntry = null;
    let autoScrollInterval = null;
    const SCROLL_SPEED = 8;
    const SCROLL_ZONE = 50; // 距离边缘多少像素时触发滚动

    /**
     * 停止自动滚动
     */
    function stopAutoScroll() {
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }

    /**
     * 根据鼠标位置自动滚动容器
     * @param {number} clientY - 鼠标 Y 坐标
     */
    function handleAutoScroll(clientY) {
        const container = regexEntriesContainer[0];
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const topEdge = rect.top;
        const bottomEdge = rect.bottom;

        stopAutoScroll();

        // 鼠标在顶部边缘区域 - 向上滚动
        if (clientY < topEdge + SCROLL_ZONE && clientY >= topEdge) {
            autoScrollInterval = setInterval(() => {
                container.scrollTop -= SCROLL_SPEED;
            }, 16);
        }
        // 鼠标在底部边缘区域 - 向下滚动
        else if (clientY > bottomEdge - SCROLL_ZONE && clientY <= bottomEdge) {
            autoScrollInterval = setInterval(() => {
                container.scrollTop += SCROLL_SPEED;
            }, 16);
        }
    }

    regexEntriesContainer.on('dragstart', '.st-chatu8-preset-entry', function (e) {
        draggedEntry = this;
        $(this).addClass('dragging');
        e.originalEvent.dataTransfer.effectAllowed = 'move';
    });

    regexEntriesContainer.on('dragend', '.st-chatu8-preset-entry', function () {
        $(this).removeClass('dragging');
        regexEntriesContainer.find('.st-chatu8-preset-entry').removeClass('drag-over');
        draggedEntry = null;
        stopAutoScroll();
    });

    regexEntriesContainer.on('dragover', '.st-chatu8-preset-entry', function (e) {
        e.preventDefault();
        e.originalEvent.dataTransfer.dropEffect = 'move';

        if (this !== draggedEntry) {
            regexEntriesContainer.find('.st-chatu8-preset-entry').removeClass('drag-over');
            $(this).addClass('drag-over');
        }

        // 处理自动滚动
        handleAutoScroll(e.originalEvent.clientY);
    });

    // 在容器上也监听 dragover，处理拖到空白区域时的滚动
    regexEntriesContainer.on('dragover', function (e) {
        if (draggedEntry) {
            e.preventDefault();
            handleAutoScroll(e.originalEvent.clientY);
        }
    });

    regexEntriesContainer.on('drop', '.st-chatu8-preset-entry', function (e) {
        e.preventDefault();
        stopAutoScroll();

        if (this !== draggedEntry && draggedEntry) {
            const $target = $(this);
            const $dragged = $(draggedEntry);

            const targetRect = this.getBoundingClientRect();
            const mouseY = e.originalEvent.clientY;
            const insertAfter = mouseY > targetRect.top + targetRect.height / 2;

            if (insertAfter) {
                $target.after($dragged);
            } else {
                $target.before($dragged);
            }

            saveRegexEntriesToProfile();
        }

        regexEntriesContainer.find('.st-chatu8-preset-entry').removeClass('drag-over');
    });

    // 拖拽离开容器时停止滚动
    regexEntriesContainer.on('dragleave', function (e) {
        // 检查是否真的离开了容器（而不是进入子元素）
        const rect = this.getBoundingClientRect();
        const x = e.originalEvent.clientX;
        const y = e.originalEvent.clientY;

        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
            stopAutoScroll();
        }
    });
}

/**
 * 绑定正则条目交互事件
 */
function bindRegexEntryEvents() {
    if (!regexEntriesContainer) return;

    // 编辑按钮
    regexEntriesContainer.on('click', '.st-chatu8-entry-edit', function (e) {
        e.stopPropagation();
        const $entry = $(this).closest('.st-chatu8-preset-entry');
        showRegexEntryEditModal($entry);
    });

    // 启用/禁用切换
    regexEntriesContainer.on('change', '.st-chatu8-entry-toggle input', function () {
        const $entry = $(this).closest('.st-chatu8-preset-entry');
        toggleRegexEntry($entry, $(this).is(':checked'));
    });

    // 导出按钮
    regexEntriesContainer.on('click', '.st-chatu8-entry-export', function (e) {
        e.stopPropagation();
        const $entry = $(this).closest('.st-chatu8-preset-entry');
        exportRegexEntry($entry);
    });

    // 删除按钮
    regexEntriesContainer.on('click', '.st-chatu8-entry-delete', function (e) {
        e.stopPropagation();
        const $entry = $(this).closest('.st-chatu8-preset-entry');
        deleteRegexEntry($entry);
    });

    // 双击打开编辑弹窗
    regexEntriesContainer.on('dblclick', '.st-chatu8-preset-entry', function (e) {
        if ($(e.target).closest('.st-chatu8-entry-actions, .st-chatu8-entry-drag-handle').length) {
            return;
        }
        showRegexEntryEditModal($(this));
    });
}

/**
 * Loads regex profiles from settings and populates the dropdown.
 */
export function loadRegexProfiles() {
    const profiles = extension_settings[extensionName].regex_profiles || {};
    const currentProfileName = extension_settings[extensionName].current_regex_profile;

    profileSelect.empty();
    Object.keys(profiles).forEach(name => {
        const option = new Option(name, name, name === currentProfileName, name === currentProfileName);
        profileSelect.append(option);
    });

    if (profileSelect.val()) {
        profileSelect.trigger('change');
    }
}

/**
 * Handles the change event of the profile selection dropdown.
 */
function onProfileSelectChange() {
    const profileName = $(this).val();
    if (!profileName) return;

    const profiles = extension_settings[extensionName].regex_profiles;
    const profile = profiles[profileName];

    if (profile) {
        beforeAfterEditor.val(profile.beforeAfterRegex || '');
        textEditor.val(profile.textRegex || '');
        extension_settings[extensionName].current_regex_profile = profileName;
        saveSettingsDebounced();

        // 加载正则条目
        loadRegexEntriesFromProfile();
    }
}

/**
 * Saves the current editor content to the selected profile.
 */
function onSaveProfileClick() {
    const profileName = profileSelect.val();
    if (!profileName) {
        toastr.warning("没有选中的配置。");
        return;
    }

    const profiles = extension_settings[extensionName].regex_profiles;

    // 保留现有的 regexEntries，同时更新其他字段
    const existingEntries = profiles[profileName]?.regexEntries || [];
    profiles[profileName] = {
        beforeAfterRegex: beforeAfterEditor.val(),
        textRegex: textEditor.val(),
        regexEntries: existingEntries
    };

    saveSettingsDebounced();
    toastr.success(`配置 "${profileName}" 已保存。`);
}

/**
 * Saves the current editor content as a new profile.
 * New profiles start empty (no inherited values from current profile).
 */
function onSaveAsProfileClick() {
    const newName = prompt("请输入新的配置名称：");
    if (!newName || newName.trim() === '') {
        toastr.warning("配置名称不能为空。");
        return;
    }

    const profiles = extension_settings[extensionName].regex_profiles;
    if (profiles[newName]) {
        toastr.error(`配置 "${newName}" 已存在。`);
        return;
    }

    // Create empty profile (no inheritance from current profile)
    profiles[newName] = {
        beforeAfterRegex: '',
        textRegex: '',
        regexEntries: []
    };
    extension_settings[extensionName].current_regex_profile = newName;
    saveSettingsDebounced();
    loadRegexProfiles();
    toastr.success(`配置 "${newName}" 已创建并选中。`);
}

/**
 * Deletes the currently selected profile.
 */
function onDeleteProfileClick() {
    const profileName = profileSelect.val();
    if (!profileName) {
        toastr.warning("没有选中的配置。");
        return;
    }

    if (Object.keys(extension_settings[extensionName].regex_profiles).length <= 1) {
        toastr.error("不能删除最后一个配置。");
        return;
    }

    if (confirm(`你确定要删除配置 "${profileName}" 吗？`)) {
        delete extension_settings[extensionName].regex_profiles[profileName];
        extension_settings[extensionName].current_regex_profile = Object.keys(extension_settings[extensionName].regex_profiles)[0];
        saveSettingsDebounced();
        loadRegexProfiles();
        toastr.success(`配置 "${profileName}" 已删除。`);
    }
}

/**
 * Exports the selected regex profile to a JSON file.
 */
function onExportProfileClick() {
    const profileName = profileSelect.val();
    if (!profileName) {
        toastr.warning("没有选中的配置可导出。");
        return;
    }
    const profile = extension_settings[extensionName].regex_profiles[profileName];
    const exportData = { [profileName]: profile };
    const blob = new Blob([JSON.stringify(exportData, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `st_is_regex_profile_${profileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Imports regex profiles from a JSON file.
 */
function onImportProfileClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedProfiles = JSON.parse(e.target.result);
                    let importedCount = 0;
                    for (const name in importedProfiles) {
                        if (Object.prototype.hasOwnProperty.call(importedProfiles, name)) {
                            extension_settings[extensionName].regex_profiles[name] = importedProfiles[name];
                            importedCount++;
                        }
                    }
                    saveSettingsDebounced();
                    loadRegexProfiles();
                    toastr.success(`成功导入 ${importedCount} 个配置。`);
                } catch (error) {
                    toastr.error("导入失败，文件格式无效。");
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

/**
 * Imports findRegex from multiple ST regex JSON files.
 * Filters by: minDepth == 0 or null, markdownOnly == true, placement includes 2
 */
function onImportSTRegexClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.multiple = true;
    input.onchange = async (event) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const importedRegexes = [];
        const readPromises = [];

        for (const file of files) {
            const promise = new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        // Check filter conditions
                        const minDepthValid = data.minDepth === 0 || data.minDepth === null;
                        const markdownOnlyValid = data.markdownOnly === true;
                        const placementValid = Array.isArray(data.placement) && data.placement.includes(2);

                        if (minDepthValid && markdownOnlyValid && placementValid) {
                            if (data.findRegex) {
                                importedRegexes.push(data.findRegex);
                            }
                        }
                    } catch (error) {
                        console.warn(`解析文件 ${file.name} 失败:`, error);
                    }
                    resolve();
                };
                reader.onerror = () => resolve();
                reader.readAsText(file);
            });
            readPromises.push(promise);
        }

        await Promise.all(readPromises);

        if (importedRegexes.length > 0) {
            // Append to existing text editor content
            const currentContent = textEditor.val().trim();
            const newContent = currentContent
                ? currentContent + '\n' + importedRegexes.join('\n')
                : importedRegexes.join('\n');
            textEditor.val(newContent);
            toastr.success(`成功导入 ${importedRegexes.length} 条正则表达式。`);
        } else {
            toastr.warning(`没有符合条件的正则表达式可导入。\n条件: minDepth=0或null, markdownOnly=true, placement包含2`);
        }
    };
    input.click();
}

/**
 * Checks if a regex script is eligible for import based on filter criteria.
 * @param {Object} script - The regex script object from ST engine.
 * @returns {boolean} True if the script meets all filter conditions.
 */
function isScriptEligibleForImport(script) {
    const minDepthValid = script.minDepth === 0 || script.minDepth === null || script.minDepth === undefined;
    const markdownOnlyValid = script.markdownOnly === true;
    const placementValid = Array.isArray(script.placement) && script.placement.includes(2);
    return minDepthValid && markdownOnlyValid && placementValid;
}

/**
 * 获取文字正则导入选择弹窗 HTML 模板
 * @param {string} listHtml - 条目列表 HTML
 * @returns {string} 弹窗 HTML
 */
function getRegexSelectionModalHTML(listHtml) {
    return `
        <div class="st-chatu8-entry-edit-modal-backdrop" id="ch-regex-selection-modal">
            <div class="st-chatu8-entry-edit-modal">
                <div class="st-chatu8-entry-edit-modal-header">
                    <h4>选择要导入的正则表达式</h4>
                    <span class="st-chatu8-entry-edit-modal-close">&times;</span>
                </div>
                <div class="st-chatu8-entry-edit-modal-body">
                    <div class="st-chatu8-modal-field st-chatu8-import-toolbar">
                        <button type="button" class="st-chatu8-btn" id="st-regex-select-all">
                            <i class="fa-solid fa-check-double"></i> 全选
                        </button>
                        <button type="button" class="st-chatu8-btn" id="st-regex-deselect-all">
                            <i class="fa-solid fa-xmark"></i> 取消全选
                        </button>
                    </div>
                    <div class="st-chatu8-modal-field st-chatu8-import-list">
                        ${listHtml}
                    </div>
                </div>
                <div class="st-chatu8-entry-edit-modal-footer">
                    <button class="st-chatu8-btn st-chatu8-modal-cancel-btn">取消</button>
                    <button class="st-chatu8-btn st-chatu8-btn-primary st-chatu8-modal-save-btn">
                        <i class="fa-solid fa-file-import"></i> 导入选中
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Shows a selection dialog for regex scripts grouped by type.
 * @param {Object} scriptsByType - Scripts grouped by type (global, scoped, preset)
 * @returns {Promise<Array>} - Selected scripts' findRegex values
 */
function showRegexSelectionDialog(scriptsByType) {
    return new Promise((resolve) => {
        const typeLabels = {
            global: '全局正则',
            scoped: '角色正则',
            preset: '预设正则'
        };

        let listHtml = '';
        for (const [type, scripts] of Object.entries(scriptsByType)) {
            if (scripts.length === 0) continue;

            listHtml += `
                <div class="st-chatu8-import-type-group">
                    <h5 class="st-chatu8-import-type-header">${typeLabels[type] || type} <span class="st-chatu8-import-count">(${scripts.length})</span></h5>
            `;

            scripts.forEach((script, index) => {
                const scriptId = `st-regex-${type}-${index}`;
                const scriptName = script.scriptName || `未命名正则 ${index + 1}`;
                listHtml += `
                    <div class="st-chatu8-import-item">
                        <label class="st-chatu8-import-label">
                            <input type="checkbox" class="st-chatu8-import-checkbox" id="${scriptId}" 
                                   data-type="${type}" data-index="${index}" checked>
                            <span class="st-chatu8-import-name">${escapeHtmlForRegex(scriptName)}</span>
                        </label>
                    </div>
                `;
            });

            listHtml += `</div>`;
        }

        // 如果弹窗已存在，先移除
        $('#ch-regex-selection-modal').remove();

        $('body').append(getRegexSelectionModalHTML(listHtml));
        const $modal = $('#ch-regex-selection-modal');

        // 全选/取消全选
        $modal.find('#st-regex-select-all').on('click', () => {
            $modal.find('.st-chatu8-import-checkbox').prop('checked', true);
        });
        $modal.find('#st-regex-deselect-all').on('click', () => {
            $modal.find('.st-chatu8-import-checkbox').prop('checked', false);
        });

        // 确认导入
        $modal.find('.st-chatu8-modal-save-btn').on('click', () => {
            const selectedRegexes = [];
            $modal.find('.st-chatu8-import-checkbox:checked').each(function () {
                const type = $(this).data('type');
                const index = $(this).data('index');
                const script = scriptsByType[type][index];
                if (script && script.findRegex) {
                    selectedRegexes.push(script.findRegex);
                }
            });
            $modal.fadeOut(200, () => $modal.remove());
            resolve(selectedRegexes);
        });

        // 取消/关闭
        $modal.find('.st-chatu8-modal-cancel-btn, .st-chatu8-entry-edit-modal-close').on('click', () => {
            $modal.fadeOut(200, () => $modal.remove());
            resolve([]);
        });

        // 点击遮罩关闭
        $modal.on('click', (e) => {
            if ($(e.target).hasClass('st-chatu8-entry-edit-modal-backdrop')) {
                $modal.fadeOut(200, () => $modal.remove());
                resolve([]);
            }
        });

        // 显示弹窗
        $modal.fadeIn(200);
    });
}

/**
 * Imports regex patterns from SillyTavern's built-in regex engine module.
 * Dynamically loads the engine and extracts findRegex from eligible scripts.
 */
async function onImportSTRegexEngineClick() {
    try {
        // Dynamically import the regex engine module
        const regexEngine = await import('../../../../../extensions/regex/engine.js');

        // Get scripts by type
        const globalScripts = regexEngine.getScriptsByType(regexEngine.SCRIPT_TYPES.GLOBAL) || [];
        const scopedScripts = regexEngine.getScriptsByType(regexEngine.SCRIPT_TYPES.SCOPED) || [];
        const presetScripts = regexEngine.getScriptsByType(regexEngine.SCRIPT_TYPES.PRESET) || [];

        // Filter: remove disabled scripts and apply eligibility filter
        const filterScripts = (scripts) => scripts.filter(script =>
            !script.disabled && isScriptEligibleForImport(script) && script.findRegex
        );

        const scriptsByType = {
            global: filterScripts(globalScripts),
            scoped: filterScripts(scopedScripts),
            preset: filterScripts(presetScripts)
        };

        const totalCount = scriptsByType.global.length + scriptsByType.scoped.length + scriptsByType.preset.length;

        if (totalCount === 0) {
            toastr.warning(`没有符合条件的正则表达式可导入。\n条件: 未禁用, minDepth=0或null, markdownOnly=true, placement包含2`);
            return;
        }

        // Show selection dialog
        const selectedRegexes = await showRegexSelectionDialog(scriptsByType);

        if (selectedRegexes.length > 0) {
            // Append to existing text editor content
            const currentContent = textEditor.val().trim();
            const newContent = currentContent
                ? currentContent + '\n' + selectedRegexes.join('\n')
                : selectedRegexes.join('\n');
            textEditor.val(newContent);
            toastr.success(`成功从ST正则引擎导入 ${selectedRegexes.length} 条正则表达式。`);
        } else {
            toastr.info('未选择任何正则表达式。');
        }
    } catch (error) {
        console.error('加载正则引擎模块失败:', error);
        toastr.error('加载ST正则引擎模块失败，请确保正则扩展已启用。');
    }
}

/**
 * Escapes special characters in a string for use in a regular expression.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
function escapeRegex(str) {
    // Escape characters with special meaning in regular expressions.
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a string is a valid regex literal (e.g., /pattern/flags).
 * Supports formats like /pattern/, /pattern/g, /pattern/gi, etc.
 * @param {string} str The string to check.
 * @returns {boolean} True if it's a regex literal, false otherwise.
 */
function isRegexLiteral(str) {
    // Check if it starts with / and ends with / or /flags (like /g, /gi, /gim, etc.)
    const regexLiteralPattern = /^\/(.+)\/([gimsuy]*)$/;
    return regexLiteralPattern.test(str);
}

/**
 * Parses a regex literal string and returns a RegExp object.
 * @param {string} str The regex literal string (e.g., /pattern/flags).
 * @returns {RegExp|null} The RegExp object or null if parsing fails.
 */
function parseRegexLiteral(str) {
    const regexLiteralPattern = /^\/(.+)\/([gimsuy]*)$/;
    const match = str.match(regexLiteralPattern);
    if (match) {
        try {
            const pattern = match[1];
            let flags = match[2];
            // Ensure 'g' flag is present for matchAll to work
            if (!flags.includes('g')) {
                flags += 'g';
            }
            return new RegExp(pattern, flags);
        } catch (e) {
            console.error(`Invalid regex pattern: ${str}`, e);
            return null;
        }
    }
    return null;
}

/**
 * Merges overlapping or adjacent ranges.
 * @param {Array<{start: number, end: number}>} ranges - An array of ranges.
 * @returns {Array<{start: number, end: number}>} A new array with merged ranges.
 */
function mergeRanges(ranges) {
    if (ranges.length < 2) return ranges;

    // Sort by start index
    ranges.sort((a, b) => a.start - b.start);

    const merged = [ranges[0]];

    for (let i = 1; i < ranges.length; i++) {
        const last = merged[merged.length - 1];
        const current = ranges[i];

        if (current.start <= last.end) {
            // Overlap or adjacent, merge them
            last.end = Math.max(last.end, current.end);
        } else {
            // No overlap, add new range
            merged.push(current);
        }
    }

    return merged;
}


/**
 * Applies the regex from the editors to the test text, tracking removed indices.
 */
function onTestRegexClick(requestId) {
    const sourceText = originalText.val();
    const beforeAfterRegexStr = beforeAfterEditor.val().trim();
    const textRegexStr = textEditor.val();
    let allRemovedRanges = [];

    try {
        let textToProcess = sourceText;
        let baseOffset = 0;

        // 1. Apply "正则预设编辑器" entries (regexEntries) - find/replace operations
        // This runs FIRST before any other processing
        const regexEntries = collectRegexEntriesFromUI();
        regexEntries.forEach(entry => {
            // Skip disabled entries
            if (entry.disabled) return;
            // Skip entries without findRegex
            if (!entry.findRegex) return;

            try {
                let findRegex;
                const findRegexStr = entry.findRegex.trim();

                // Check if findRegex is a regex literal (e.g., /pattern/flags)
                if (isRegexLiteral(findRegexStr)) {
                    findRegex = parseRegexLiteral(findRegexStr);
                    if (!findRegex) {
                        console.warn(`正则条目 "${entry.scriptName}" 的 findRegex 解析失败: ${findRegexStr}`);
                        return;
                    }
                } else {
                    // Treat as plain regex pattern, add global flag
                    findRegex = new RegExp(findRegexStr, 'g');
                }

                const replaceString = entry.replaceString || '';

                // Apply replacement to textToProcess
                textToProcess = textToProcess.replace(findRegex, replaceString);
            } catch (e) {
                console.warn(`正则条目 "${entry.scriptName}" 执行失败:`, e);
            }
        });

        // 2. Apply "前后正则" (Context trimming)
        if (beforeAfterRegexStr.includes('|')) {
            const parts = beforeAfterRegexStr.split('|');
            if (parts.length === 2) {
                const before = parts[0] === '^' ? '^' : escapeRegex(parts[0]);
                const after = parts[1] === '$' ? '$' : escapeRegex(parts[1]);
                const contextRegex = new RegExp(`${before}([\\s\\S]*?)${after}`, 'i');
                const match = textToProcess.match(contextRegex);

                if (match && typeof match[1] === 'string') {
                    const content = match[1];
                    const contentStart = match.index + match[0].indexOf(content);
                    const contentEnd = contentStart + content.length;

                    if (contentStart > 0) {
                        allRemovedRanges.push({ start: 0, end: contentStart });
                    }
                    if (contentEnd < textToProcess.length) {
                        allRemovedRanges.push({ start: contentEnd, end: textToProcess.length });
                    }

                    textToProcess = content;
                    baseOffset = contentStart;
                }
            }
        }

        // 3. Apply "文字正则" (Text removal) and collect ranges
        let relativeRanges = [];
        if (textRegexStr.trim()) {
            const lines = textRegexStr.split('\n');
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (!trimmedLine) return;

                let removalRegex;

                // Check if this line is a true regex literal (e.g., /pattern/g)
                if (isRegexLiteral(trimmedLine)) {
                    // Parse as a true regex literal
                    removalRegex = parseRegexLiteral(trimmedLine);
                    if (!removalRegex) {
                        console.warn(`Failed to parse regex literal: ${trimmedLine}`);
                        return; // Skip this line if parsing fails
                    }
                } else if (trimmedLine.includes('|')) {
                    // Legacy pipe-separated format: start|end
                    const parts = trimmedLine.split('|');
                    if (parts.length === 2) {
                        const start = parts[0] === '^' ? '^' : escapeRegex(parts[0]);
                        const end = parts[1] === '$' ? '$' : escapeRegex(parts[1]);
                        removalRegex = new RegExp(`${start}[\\s\\S]*?${end}`, 'g');
                    }
                } else {
                    // Plain text - escape and match literally
                    removalRegex = new RegExp(escapeRegex(trimmedLine), 'g');
                }

                if (removalRegex) {
                    for (const match of textToProcess.matchAll(removalRegex)) {
                        relativeRanges.push({
                            start: match.index,
                            end: match.index + match[0].length
                        });
                    }
                }
            });
        }

        // 4. Merge relative ranges and generate final text
        const mergedRelativeRanges = mergeRanges(relativeRanges);
        let final_text = '';
        let lastIndex = 0;
        mergedRelativeRanges.forEach(range => {
            final_text += textToProcess.substring(lastIndex, range.start);
            lastIndex = range.end;
        });
        final_text += textToProcess.substring(lastIndex);

        // 5. Adjust relative ranges to be absolute and add to the main list
        const absoluteTextRanges = mergedRelativeRanges.map(range => ({
            start: range.start + baseOffset,
            end: range.end + baseOffset
        }));
        allRemovedRanges.push(...absoluteTextRanges);

        // 6. Final merge of all ranges
        const finalRemovedRanges = mergeRanges(allRemovedRanges);

        final_text = final_text.trim();
        resultText.val(final_text);

        // 7. 添加处理后文本到日志
        addLog(`[Regex 处理后文本]\n${final_text}`);

        // 8. Emit result
        const isAutomatedCall = !!requestId;
        const isTestMode = extension_settings[extensionName].regexTestMode;

        if (isAutomatedCall || !isTestMode) {
            eventSource.emit(eventNames.REGEX_RESULT_MESSAGE, {
                message: final_text,
                removedRanges: finalRemovedRanges, // Include the ranges
                id: requestId
            });
        }
    } catch (e) {
        toastr.error(`正则表达式错误: ${e.message}`);
        resultText.val(`错误: ${e.message}`);
    }
}


/**
 * Handles the change event of the test mode switch.
 */
function onRegexTestModeChange() {
    extension_settings[extensionName].regexTestMode = $(this).is(':checked');
    saveSettingsDebounced();
}

function onGestureEnabledChange() {
    const enabled = $(this).is(':checked');
    extension_settings[extensionName].gestureEnabled = enabled;
    saveSettingsDebounced();

    // 根据开关状态启动或停止手势监控
    if (enabled) {
        initGestureMonitor();
    } else {
        stopGestureMonitor();
    }
}

function onClickTriggerEnabledChange() {
    const enabled = $(this).is(':checked');
    extension_settings[extensionName].clickTriggerEnabled = enabled;
    saveSettingsDebounced();

    // 根据开关状态启动或停止点击触发监控
    if (enabled) {
        initClickTriggerMonitor();
    } else {
        stopClickTriggerMonitor();
    }
}

function onGestureShowRecognitionChange() {
    extension_settings[extensionName].gestureShowRecognition = $(this).is(':checked');
    saveSettingsDebounced();
}

function onGestureShowTrailChange() {
    extension_settings[extensionName].gestureShowTrail = $(this).is(':checked');
    saveSettingsDebounced();
}

function onGestureTrailColorChange() {
    extension_settings[extensionName].gestureTrailColor = $(this).val();
    saveSettingsDebounced();
}

function onImageGenDemandEnabledChange() {
    extension_settings[extensionName].imageGenDemandEnabled = $(this).is(':checked');
    saveSettingsDebounced();
}

function onGestureMatchThresholdChange() {
    const value = $(this).val();
    gestureMatchThresholdValue.text(`${value}%`);
    extension_settings[extensionName].gestureMatchThreshold = parseInt(value, 10);
    saveSettingsDebounced();
}

function onDefaultCharDemandChange() {
    extension_settings[extensionName].defaultCharDemand = $(this).val();
    saveSettingsDebounced();
}

function onDefaultImageDemandChange() {
    extension_settings[extensionName].defaultImageDemand = $(this).val();
    saveSettingsDebounced();
}

/**
 * Initializes the regex settings tab.
 */
export function initRegexSettings() {
    // Cache DOM elements
    profileSelect = $('#ch-regex-profile-select');
    beforeAfterEditor = $('#ch-regex-before-after-editor');
    textEditor = $('#ch-regex-text-editor');
    originalText = $('#ch-regex-test-original-text');
    resultText = $('#ch-regex-test-result-text');
    regexTestModeSwitch = $('#ch-regex-test-mode');
    gestureEnabledSwitch = $('#ch-gesture-enabled');
    clickTriggerEnabledSwitch = $('#ch-click-trigger-enabled');
    gestureShowRecognitionSwitch = $('#ch-gesture-show-recognition');
    gestureShowTrailSwitch = $('#ch-gesture-show-trail');
    gestureTrailColorPicker = $('#ch-gesture-trail-color');
    gestureMatchThresholdSlider = $('#ch-gesture-match-threshold');
    gestureMatchThresholdValue = $('#ch-gesture-match-threshold-value');
    imageGenDemandEnabledSwitch = $('#ch-image-gen-demand-enabled');
    defaultCharDemandTextarea = $('#ch-default-char-demand');
    defaultImageDemandTextarea = $('#ch-default-image-demand');

    // Load initial state
    regexTestModeSwitch.prop('checked', extension_settings[extensionName].regexTestMode ?? false);
    gestureEnabledSwitch.prop('checked', extension_settings[extensionName].gestureEnabled ?? false);
    clickTriggerEnabledSwitch.prop('checked', extension_settings[extensionName].clickTriggerEnabled ?? false);
    gestureShowRecognitionSwitch.prop('checked', extension_settings[extensionName].gestureShowRecognition ?? true);
    gestureShowTrailSwitch.prop('checked', extension_settings[extensionName].gestureShowTrail ?? true);
    gestureTrailColorPicker.val(extension_settings[extensionName].gestureTrailColor ?? '#00ff00');
    const threshold = extension_settings[extensionName].gestureMatchThreshold ?? 60;
    gestureMatchThresholdSlider.val(threshold);
    gestureMatchThresholdValue.text(`${threshold}%`);
    imageGenDemandEnabledSwitch.prop('checked', extension_settings[extensionName].imageGenDemandEnabled ?? false);
    defaultCharDemandTextarea.val(extension_settings[extensionName].defaultCharDemand ?? '');
    defaultImageDemandTextarea.val(extension_settings[extensionName].defaultImageDemand ?? '');


    // Bind event listeners
    $('#ch-new-regex-profile-button').on('click', onSaveAsProfileClick); // "New" is "Save As"
    $('#ch-save-regex-profile-button').on('click', onSaveProfileClick);
    $('#ch-save-as-regex-profile-button').on('click', onSaveAsProfileClick);
    $('#ch-delete-regex-profile-button').on('click', onDeleteProfileClick);
    $('#ch-import-regex-profile-button').on('click', onImportProfileClick);
    $('#ch-export-regex-profile-button').on('click', onExportProfileClick);
    $('#ch-test-regex-button').on('click', () => onTestRegexClick()); // Pass no argument for manual click
    profileSelect.on('change', onProfileSelectChange);
    regexTestModeSwitch.on('change', onRegexTestModeChange);
    gestureEnabledSwitch.on('change', onGestureEnabledChange);
    clickTriggerEnabledSwitch.on('change', onClickTriggerEnabledChange);
    gestureShowRecognitionSwitch.on('change', onGestureShowRecognitionChange);
    gestureShowTrailSwitch.on('change', onGestureShowTrailChange);
    gestureTrailColorPicker.on('input', onGestureTrailColorChange);
    gestureMatchThresholdSlider.on('input', onGestureMatchThresholdChange);
    imageGenDemandEnabledSwitch.on('change', onImageGenDemandEnabledChange);
    defaultCharDemandTextarea.on('input', onDefaultCharDemandChange);
    defaultImageDemandTextarea.on('input', onDefaultImageDemandChange);

    // Gesture recording buttons
    $('#ch-gesture-1-button').on('click', () => onRecordGestureClick('gesture1'));
    $('#ch-gesture-2-button').on('click', () => onRecordGestureClick('gesture2'));

    // Listen for the custom event from eventSource to update the test text
    eventSource.on(eventNames.REGEX_TEST_MESSAGE, (data) => {
        const { message, id } = data;
        if (originalText && message) {
            // 清除日志并添加原始文本
            clearLog();
            addLog(`[Regex 原始文本]\n${message}`);
            originalText.val(message);
            // Automatically trigger the test, passing the request ID
            onTestRegexClick(id);
        }
    });

    // 初始化正则预设编辑器（必须在 loadRegexProfiles 之前设置）
    regexEntriesContainer = $('#ch-regex-entries-container');

    // 绑定正则条目按钮事件
    $('#ch-add-regex-entry-button').on('click', addNewRegexEntry);
    $('#ch-import-regex-entry-button').on('click', importRegexEntries);
    $('#ch-import-regex-entry-engine-button').on('click', importRegexEntriesFromEngine);

    // 绑定正则条目拖拽和交互事件
    bindRegexEntryDragEvents();
    bindRegexEntryEvents();

    // Initial load of profiles（会触发 change 事件，从而通过 onProfileSelectChange 加载正则条目）
    loadRegexProfiles();
}


/**
 * Handles the click event for recording a gesture.
 * @param {'gesture1' | 'gesture2'} gestureKey - The key for the gesture to be recorded.
 */
async function onRecordGestureClick(gestureKey) {
    try {
        const newPattern = await recordGesture();
        if (newPattern) {
            extension_settings[extensionName][gestureKey] = newPattern;
            saveSettingsDebounced();
            toastr.success(`手势 "${gestureKey === 'gesture1' ? '一' : '二'}" 已更新。`);
        }
    } catch (error) {
        toastr.error("录制手势失败。");
        console.error("Gesture recording failed:", error);
    }
}
