/* global toastr */
// @ts-nocheck
/**
 * llm.js - LLM 模块入口
 * 
 * 整合并初始化 LLM 服务层和 UI 层
 */

// 从服务层导入核心功能
import {
    isLLMRequestActive,
    abortLLMRequest,
    isLLMTestMode,
    formatPromptForDisplay,
    getRoleLabel,
    getCurrentLLMProfile,
    getCurrentTestContext,
    getEffectiveConfigForRequestType,
    buildPromptForRequestType,
    executeTypedLLMRequest,
    executeDefaultLLMRequest,
    createGetPromptHandler,
    createExecuteHandler
} from "./llmService.js";

// 从 UI 层导入
import {
    updateCombinedPrompt,
    loadLLMProfiles,
    populateRequestTypeSelects,
    collectProfileDataFromUI,
    cacheDOMElements,
    bindUIEvents,
    registerEventListeners,
    loadInitialData
} from "./llmUi.js";

// ==================== 初始化 ====================

/**
 * Initializes the LLM settings tab.
 */
export function initLLMSettings() {
    // 缓存 DOM 元素
    cacheDOMElements();

    // 绑定 UI 事件
    bindUIEvents();

    // 注册事件监听器
    registerEventListeners();

    // 加载初始数据
    loadInitialData();
}

// ==================== 重新导出公共 API ====================

// 服务层导出
export {
    isLLMRequestActive,
    abortLLMRequest,
    isLLMTestMode,
    formatPromptForDisplay,
    getRoleLabel,
    getCurrentLLMProfile,
    getCurrentTestContext,
    getEffectiveConfigForRequestType,
    buildPromptForRequestType,
    executeTypedLLMRequest,
    executeDefaultLLMRequest,
    createGetPromptHandler,
    createExecuteHandler
};

// UI 层导出
export {
    updateCombinedPrompt,
    loadLLMProfiles,
    populateRequestTypeSelects,
    collectProfileDataFromUI
};
