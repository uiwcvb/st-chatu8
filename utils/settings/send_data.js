// @ts-nocheck
import { getrWorlds, getWorldEntries, getcharWorld } from '../promptReq.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../../../script.js';
import { extension_settings } from '../../../../../extensions.js';
import { extensionName } from '../config.js';

let worldList = [];
let worldEntrySelections = {}; // 结构: { worldName: { entryKey: boolean } }
let worldBookSelections = {}; // 结构: { worldName: boolean } - 左侧世界书的启用状态
let activeWorld = null; // 当前左侧高亮的世界书
let currentCharWorldName = null; // 当前角色的世界书名称

/**
 * 获取插件配置中的世界书设置
 * @returns {Object} 世界书配置对象
 */
function getWorldBookConfig() {
    const settings = extension_settings[extensionName];
    if (!settings.worldBookConfig) {
        settings.worldBookConfig = {
            worldBookSelections: {},  // 世界书开启状态（不包含当前角色世界书）
            worldEntrySelections: {}  // 条目开启信息（所有世界书）
        };
    }
    return settings.worldBookConfig;
}

/**
 * 保存世界书配置到插件设置
 * 当前角色世界书只保存条目信息，不保存世界书开启状态
 */
function saveWorldBookConfig() {
    const config = getWorldBookConfig();

    // 保存条目开启信息（所有世界书都保存）
    config.worldEntrySelections = { ...worldEntrySelections };

    // 保存世界书开启状态
    // 当前角色世界书不保存开启状态（避免跨角色卡影响）
    const newWorldBookSelections = {};
    for (const worldName in worldBookSelections) {
        if (worldName !== currentCharWorldName) {
            // 非当前角色世界书：保存开启状态
            newWorldBookSelections[worldName] = worldBookSelections[worldName];
        }
        // 当前角色世界书：不保存开启状态（跳过）
    }
    config.worldBookSelections = newWorldBookSelections;

    saveSettingsDebounced();
}

export function initSendData(settingsModal) {
    const worldListContainer = settingsModal.find('#ch-send-data-world-list');
    const entryListContainer = settingsModal.find('#ch-send-data-entry-list');
    const worldSearchInput = settingsModal.find('#ch-send-data-world-search');
    const entrySearchInput = settingsModal.find('#ch-send-data-entry-search');

    async function loadAndRenderWorlds() {
        worldList = await getrWorlds();
        currentCharWorldName = await getcharWorld();
        const config = getWorldBookConfig();

        console.log('[send_data] 当前角色世界书:', currentCharWorldName);
        console.log('[send_data] 插件配置:', config);

        // 加载条目开启信息
        worldEntrySelections = { ...(config.worldEntrySelections || {}) };

        // 加载世界书开启状态（不包含当前角色世界书）
        worldBookSelections = { ...(config.worldBookSelections || {}) };

        // 处理当前角色世界书
        if (currentCharWorldName) {
            const hasCharWorldEntrySettings =
                worldEntrySelections[currentCharWorldName] &&
                Object.keys(worldEntrySelections[currentCharWorldName]).length > 0;

            if (!hasCharWorldEntrySettings) {
                // 插件配置中没有当前角色世界书的条目记录
                // 默认开启世界书且条目全部开启
                console.log('[send_data] 当前角色世界书无条目记录，初始化默认设置');
                worldBookSelections[currentCharWorldName] = true;

                const charWorldEntries = await getWorldEntries(currentCharWorldName);
                if (charWorldEntries) {
                    worldEntrySelections[currentCharWorldName] = {};
                    const entriesArray = Array.isArray(charWorldEntries)
                        ? charWorldEntries
                        : Object.values(charWorldEntries);
                    entriesArray.forEach(entry => {
                        const entryKey = entry.uid;
                        if (entryKey !== undefined && entryKey !== null) {
                            worldEntrySelections[currentCharWorldName][entryKey] = true;
                        }
                    });
                }

                // 保存初始化的条目设置
                saveWorldBookConfig();
            } else {
                // 有条目记录，默认开启该世界书
                console.log('[send_data] 当前角色世界书有条目记录，默认开启');
                worldBookSelections[currentCharWorldName] = true;
            }
        }

        // 如果当前没有选中的世界书，且列表不为空，默认选第一个
        if (!activeWorld && worldList.length > 0) {
            activeWorld = worldList[0];
        }

        renderWorldList();
        renderEntryList(); // 初始加载右侧
    }

    function renderWorldList() {
        worldListContainer.empty();
        const fragment = document.createDocumentFragment();
        const searchTerm = worldSearchInput.val().toLowerCase();

        worldList
            .filter(worldName => worldName.toLowerCase().includes(searchTerm))
            .forEach(worldName => {
                const worldItem = $('<div></div>')
                    .addClass('st-chatu8-list-item')
                    .data('worldName', worldName);

                // 创建勾选框容器（使用与右侧相同的样式）
                const checkboxWrapper = $('<span></span>')
                    .addClass('st-chatu8-world-checkbox')
                    .css({
                        position: 'relative',
                        marginRight: '10px',
                        display: 'inline-block',
                        width: '16px',
                        height: '16px'
                    });

                // 创建文本内容
                const textSpan = $('<span></span>').text(worldName);

                // 如果是当前角色世界书，添加标记
                if (worldName === currentCharWorldName) {
                    textSpan.append($('<span></span>')
                        .text(' (角色)')
                        .css({ color: '#4CAF50', fontSize: '0.85em' }));
                }

                // 如果世界书被启用，添加 selected 类
                if (worldBookSelections[worldName]) {
                    worldItem.addClass('world-selected');
                }

                // 状态1: Active (当前正在右侧查看)
                if (worldName === activeWorld) {
                    worldItem.addClass('active');
                }

                worldItem.append(checkboxWrapper).append(textSpan);
                fragment.appendChild(worldItem[0]);
            });
        worldListContainer.append(fragment);
    }

    async function renderEntryList() {
        entryListContainer.empty();
        if (!activeWorld) {
            entryListContainer.html('<div style="padding:10px; color:#888;">请先在左侧选择一个世界书。</div>');
            return;
        }

        // 显示加载中状态（可选）
        // entryListContainer.text('加载中...'); 

        const searchTerm = entrySearchInput.val().toLowerCase();
        const entries = await getWorldEntries(activeWorld);

        entryListContainer.empty(); // 清除加载文字
        const fragment = document.createDocumentFragment();

        if (entries) {
            // 获取当前世界书的选中状态
            const currentWorldSelections = worldEntrySelections[activeWorld] || {};

            // 注意：getWorldEntries 返回的通常是对象或数组，这里假设是对象
            // 如果 entries 是数组，请直接用 entries.filter...
            const entriesArray = Array.isArray(entries) ? entries : Object.values(entries);

            const filteredEntries = entriesArray.filter(entry => {
                // 搜索逻辑：同时匹配 key 和 comment
                const key = entry.key || entry.uid || "";
                const comment = entry.comment || "";
                return String(key).toLowerCase().includes(searchTerm) ||
                    String(comment).toLowerCase().includes(searchTerm);
            });

            if (filteredEntries.length === 0) {
                entryListContainer.html('<div style="padding:10px; color:#888;">没有找到匹配的条目。</div>');
                return;
            }

            filteredEntries.forEach(entry => {
                const entryKey = entry.uid; // 使用 uid 作为唯一标识
                const displayName = entry.comment || `条目 ${entryKey}`; // 优先显示 comment
                const entryItem = $('<div></div>')
                    .addClass('st-chatu8-list-item')
                    .data('entryKey', entryKey)
                    .data('entryContent', entry.content || '');

                // 创建文本容器
                const textSpan = $('<span></span>')
                    .addClass('st-chatu8-entry-text')
                    .text(displayName);

                // 创建眼睛图标
                const eyeIcon = $('<i></i>')
                    .addClass('fa fa-eye st-chatu8-entry-view-icon')
                    .attr('title', '查看内容')
                    .on('click', function (e) {
                        e.stopPropagation(); // 防止触发条目选中
                        showEntryContentModal(displayName, entry.content || '');
                    });

                entryItem.append(textSpan).append(eyeIcon);

                // 根据状态添加对应的类
                const entryState = currentWorldSelections[entryKey];
                if (entryState === 'force') {
                    entryItem.addClass('selected force-enabled');
                } else if (entryState === true || entryState === undefined) {
                    entryItem.addClass('selected');
                }
                fragment.appendChild(entryItem[0]);
            });
        } else {
            entryListContainer.html('<div style="padding:10px; color:#888;">这个世界书是空的。</div>');
        }
        entryListContainer.append(fragment);
    }

    // --- 事件处理 ---

    function handleWorldClick(event) {
        const target = $(event.target).closest('.st-chatu8-list-item');
        if (!target.length) return;

        const worldName = target.data('worldName');
        if (!worldName) return;

        // 检查是否点击的是勾选框区域
        const checkboxArea = $(event.target).closest('.st-chatu8-world-checkbox');

        if (checkboxArea.length) {
            // 点击勾选框：切换世界书启用状态
            worldBookSelections[worldName] = !worldBookSelections[worldName];

            // 保存配置到插件设置
            saveWorldBookConfig();

            // 刷新左侧列表
            renderWorldList();
        } else {
            // 点击文本区域：切换选中的世界书
            if (worldName !== activeWorld) {
                activeWorld = worldName;
                renderWorldList(); // 刷新左侧高亮
                renderEntryList(); // 加载右侧内容
            }
        }
    }

    // 长按计时器和状态
    let longPressTimer = null;
    let isLongPress = false;
    const LONG_PRESS_DURATION = 500; // 长按阈值：500ms

    function handleEntryMouseDown(event) {
        const target = $(event.target).closest('.st-chatu8-list-item');
        if (!target.length || !activeWorld) return;

        // 排除眼睛图标点击
        if ($(event.target).closest('.st-chatu8-entry-view-icon').length) return;

        isLongPress = false;

        // 开始长按计时
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            // 长按触发：切换强制启用状态
            handleForceToggle(target);
        }, LONG_PRESS_DURATION);
    }

    function handleEntryMouseUp(event) {
        // 清除长按计时器
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    }

    function handleEntryClick(event) {
        const target = $(event.target).closest('.st-chatu8-list-item');
        if (!target.length || !activeWorld) return;

        // 排除眼睛图标点击
        if ($(event.target).closest('.st-chatu8-entry-view-icon').length) return;

        const entryKey = target.data('entryKey');
        if (entryKey === undefined || entryKey === null) return;

        // 右键点击：切换强制启用
        if (event.type === 'contextmenu') {
            event.preventDefault();
            handleForceToggle(target);
            return;
        }

        // 如果是长按触发的，不处理普通点击
        if (isLongPress) {
            isLongPress = false;
            return;
        }

        // 初始化该世界书的数据结构
        if (!worldEntrySelections[activeWorld]) {
            worldEntrySelections[activeWorld] = {};
        }

        const currentState = worldEntrySelections[activeWorld][entryKey];

        // 短按：在启用和禁用之间切换
        if (currentState === true || currentState === 'force' || currentState === undefined) {
            worldEntrySelections[activeWorld][entryKey] = false;
        } else {
            worldEntrySelections[activeWorld][entryKey] = true;
        }

        // 保存配置到插件设置
        saveWorldBookConfig();

        // 重新渲染条目列表以更新视觉状态
        renderEntryList();
        renderWorldList();
    }

    function handleForceToggle(target) {
        const entryKey = target.data('entryKey');
        if (entryKey === undefined || entryKey === null) return;

        // 初始化该世界书的数据结构
        if (!worldEntrySelections[activeWorld]) {
            worldEntrySelections[activeWorld] = {};
        }

        const currentState = worldEntrySelections[activeWorld][entryKey];

        // 切换强制启用状态
        if (currentState === 'force') {
            // 已经是强制启用，切换回普通启用
            worldEntrySelections[activeWorld][entryKey] = true;
            toastr.info('已取消强制启用');
        } else {
            // 切换到强制启用
            worldEntrySelections[activeWorld][entryKey] = 'force';
            toastr.success('已设为强制启用');
        }

        // 保存配置到插件设置
        saveWorldBookConfig();

        // 重新渲染条目列表以更新视觉状态
        renderEntryList();
        renderWorldList();
    }

    // 全选按钮处理 - 只对当前显示的条目生效
    async function handleSelectAll() {
        if (!activeWorld) return;

        const entries = await getWorldEntries(activeWorld);
        if (!entries) return;

        // 初始化该世界书的数据结构
        if (!worldEntrySelections[activeWorld]) {
            worldEntrySelections[activeWorld] = {};
        }

        // 获取当前搜索词,使用与 renderEntryList 相同的过滤逻辑
        const searchTerm = entrySearchInput.val().toLowerCase();
        const entriesArray = Array.isArray(entries) ? entries : Object.values(entries);

        // 过滤出当前显示的条目
        const filteredEntries = entriesArray.filter(entry => {
            const key = entry.key || entry.uid || "";
            const comment = entry.comment || "";
            return String(key).toLowerCase().includes(searchTerm) ||
                String(comment).toLowerCase().includes(searchTerm);
        });

        // 只对显示的条目执行全选
        filteredEntries.forEach(entry => {
            const entryKey = entry.uid;
            if (entryKey !== undefined && entryKey !== null) {
                worldEntrySelections[activeWorld][entryKey] = true;
            }
        });

        // 保存配置到插件设置
        saveWorldBookConfig();
        renderWorldList();
        renderEntryList();
    }

    // 取消全选按钮处理 - 只对当前显示的条目生效
    async function handleDeselectAll() {
        if (!activeWorld) return;

        const entries = await getWorldEntries(activeWorld);
        if (!entries) return;

        // 初始化该世界书的数据结构
        if (!worldEntrySelections[activeWorld]) {
            worldEntrySelections[activeWorld] = {};
        }

        // 获取当前搜索词,使用与 renderEntryList 相同的过滤逻辑
        const searchTerm = entrySearchInput.val().toLowerCase();
        const entriesArray = Array.isArray(entries) ? entries : Object.values(entries);

        // 过滤出当前显示的条目
        const filteredEntries = entriesArray.filter(entry => {
            const key = entry.key || entry.uid || "";
            const comment = entry.comment || "";
            return String(key).toLowerCase().includes(searchTerm) ||
                String(comment).toLowerCase().includes(searchTerm);
        });

        // 只对显示的条目执行取消全选
        filteredEntries.forEach(entry => {
            const entryKey = entry.uid;
            if (entryKey !== undefined && entryKey !== null) {
                worldEntrySelections[activeWorld][entryKey] = false;
            }
        });

        // 保存配置到插件设置
        saveWorldBookConfig();
        renderWorldList();
        renderEntryList();
    }

    // 显示条目内容弹窗 - 模仿 worker.js 的可视化弹窗实现
    function showEntryContentModal(title, content) {
        // 移除已存在的弹窗
        document.querySelector('.st-chatu8-entry-content-backdrop')?.remove();

        // 创建弹窗 - 使用与 worker.js 相同的结构
        const backdrop = document.createElement('div');
        backdrop.className = 'st-chatu8-workflow-viz-backdrop st-chatu8-entry-content-backdrop';
        backdrop.innerHTML = `
            <div class="st-chatu8-workflow-viz-dialog st-chatu8-entry-content-dialog">
                <div class="st-chatu8-workflow-viz-header">
                    <h3>${$('<div>').text(title).html()}</h3>
                    <span class="st-chatu8-workflow-viz-close">&times;</span>
                </div>
                <div class="st-chatu8-entry-content-body">
                    <pre class="st-chatu8-entry-content-text">${$('<div>').text(content || '(无内容)').html()}</pre>
                </div>
            </div>
        `;
        document.body.appendChild(backdrop);

        // 关闭按钮
        const closeBtn = backdrop.querySelector('.st-chatu8-workflow-viz-close');
        closeBtn.onclick = () => backdrop.remove();

        // 点击背景关闭
        backdrop.onclick = (e) => {
            if (e.target === backdrop) backdrop.remove();
        };

        // ESC键关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                backdrop.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // 绑定事件
    // 使用 off() 防止重复绑定 (如果 initSendData 会被多次调用)
    worldListContainer.off('click').on('click', handleWorldClick);
    entryListContainer
        .off('click contextmenu mousedown mouseup mouseleave touchstart touchend touchcancel')
        .on('click', handleEntryClick)
        .on('contextmenu', handleEntryClick)
        .on('mousedown touchstart', handleEntryMouseDown)
        .on('mouseup mouseleave touchend touchcancel', handleEntryMouseUp);

    worldSearchInput.off('input').on('input', renderWorldList);
    entrySearchInput.off('input').on('input', renderEntryList);

    // 刷新世界书按钮处理
    async function handleRefreshWorlds() {
        const refreshButton = settingsModal.find('#ch-send-data-refresh-worlds');
        const originalHtml = refreshButton.html();

        // 显示加载状态
        refreshButton.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> 刷新中...');

        try {
            // 重新加载世界书列表
            await loadAndRenderWorlds();

            // 显示成功提示
            toastr.success('世界书已刷新');
        } catch (error) {
            console.error('[send_data] 刷新世界书失败:', error);
            toastr.error('刷新世界书失败: ' + error.message);
        } finally {
            // 恢复按钮状态
            refreshButton.prop('disabled', false).html(originalHtml);
        }
    }

    // 绑定全选/取消全选按钮
    settingsModal.find('#ch-send-data-select-all').off('click').on('click', handleSelectAll);
    settingsModal.find('#ch-send-data-deselect-all').off('click').on('click', handleDeselectAll);

    // 绑定刷新世界书按钮
    settingsModal.find('#ch-send-data-refresh-worlds').off('click').on('click', handleRefreshWorlds);

    // 监听聊天加载事件
    eventSource.on(event_types.GENERATION_STARTED, loadAndRenderWorlds);

    // 立即加载一次
    //loadAndRenderWorlds();
}
