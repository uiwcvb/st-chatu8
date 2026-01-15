// @ts-nocheck
import { extension_settings } from "../../../../../extensions.js";
import { saveSettingsDebounced } from "../../../../../../script.js";
import { getLog, clearLog } from '../utils.js';
import { stylishConfirm } from '../utils.js';

// --- Log Management ---
function updateLogView() {
    const logTextarea = document.getElementById('ch-log-textarea');
    if (logTextarea) {
        logTextarea.value = getLog();
        // Scroll to top to show the latest logs first
        logTextarea.scrollTop = 0;
    }
}

function handleExportLog() {
    const logContent = getLog();
    if (!logContent || logContent.trim() === '') {
        alert("日志为空。");
        return;
    }
    const blob = new Blob([logContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `st-chatu8-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function handleClearLog() {
    stylishConfirm("确定要清空所有日志吗？此操作不可撤销。").then(confirmed => {
        if (confirmed) {
            clearLog();
            saveSettingsDebounced();
            updateLogView();
            alert("日志已清空。");
        }
    });
}

export function initLogSettings(settingsModal) {
    settingsModal.find('#ch-export-log').on('click', handleExportLog);
    settingsModal.find('#ch-clear-log').on('click', handleClearLog);
}

// Export for use in tab switching
export { updateLogView };
