
// 缓存当前生成的按钮样式 CSS，用于注入到 iframe
let currentButtonStyleCSS = '';

/**
 * 将按钮样式注入到指定文档（用于 iframe）
 * @param {Document} targetDoc - 目标文档对象
 */
export function injectButtonStyleToDocument(targetDoc) {
    if (!targetDoc || !currentButtonStyleCSS) return;

    const styleId = 'st-chatu8-generate-btn-style';
    let styleEl = targetDoc.getElementById(styleId);

    if (!styleEl) {
        styleEl = targetDoc.createElement('style');
        styleEl.id = styleId;
        // 尝试插入到 head，如果没有则插入到 documentElement
        const target = targetDoc.head || targetDoc.documentElement;
        if (target) {
            target.appendChild(styleEl);
        } else {
            return; // 无法注入
        }
    }

    // 只有当内容不同时才更新，避免不必要的重绘
    if (styleEl.textContent !== currentButtonStyleCSS) {
        styleEl.textContent = currentButtonStyleCSS;
    }
}

export function applyGenerateButtonStyle(styleName, isDark = true) {
    const styleId = 'st-chatu8-generate-btn-style';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
    }

    let css = '';
    const btnSelector = '.st-chatu8-image-button';

    // Keyframes for animations
    const keyframes = `
        @keyframes st-chatu8-pulse {
            0% { box-shadow: 0 0 0 0 rgba(0, 255, 255, 0.4); }
            70% { box-shadow: 0 0 0 10px rgba(0, 255, 255, 0); }
            100% { box-shadow: 0 0 0 0 rgba(0, 255, 255, 0); }
        }
        @keyframes st-chatu8-gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        @keyframes st-chatu8-wobble {
            0% { transform: translateY(0); }
            20% { transform: translateY(-3px); }
            40% { transform: translateY(1px); }
            60% { transform: translateY(-1px); }
            80% { transform: translateY(0.5px); }
            100% { transform: translateY(0); }
        }
        @keyframes st-chatu8-spin {
            0% { transform: translate(-50%, -50%) rotate(0deg); }
            100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
    `;

    // 加载状态的通用样式 - 适用于所有图标类型按钮
    const loadingStyles = `
        /* 加载状态 - 隐藏原有图标，显示旋转加载动画 */
        ${btnSelector}[data-loading="true"]::before {
            content: '\\f110' !important; /* fa-spinner */
            font-family: "Font Awesome 6 Free", "Font Awesome 5 Free", "FontAwesome" !important;
            font-weight: 900 !important;
            animation: st-chatu8-spin 1s linear infinite !important;
        }
        /* 加载状态下隐藏 ::after 装饰元素 */
        ${btnSelector}[data-loading="true"]::after {
            display: none !important;
        }
    `;

    css += keyframes;
    css += loadingStyles;

    switch (styleName) {
        case '渐变-蓝紫':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #5a3f9a 100%) !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 8px !important;
                    padding: 8px 18px !important;
                    box-shadow: 
                        0 4px 15px rgba(118, 75, 162, 0.35),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.1) !important;
                    transition: all 0.25s ease;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
                }
                ${btnSelector}:hover {
                    box-shadow: 
                        0 6px 20px rgba(118, 75, 162, 0.5),
                        inset 0 1px 0 rgba(255, 255, 255, 0.25),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.15) !important;
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                    filter: brightness(0.95);
                }
            `;
            break;
        case '渐变-橙红':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, #ff7e5f 0%, #ff512f 50%, #f09819 100%) !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 8px !important;
                    padding: 8px 18px !important;
                    box-shadow: 
                        0 4px 15px rgba(255, 81, 47, 0.35),
                        inset 0 1px 0 rgba(255, 255, 255, 0.25),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.1) !important;
                    transition: all 0.25s ease;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
                }
                ${btnSelector}:hover {
                    box-shadow: 
                        0 6px 20px rgba(255, 81, 47, 0.5),
                        inset 0 1px 0 rgba(255, 255, 255, 0.3),
                        inset 0 -1px 0 rgba(0, 0, 0, 0.15) !important;
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                    filter: brightness(0.95);
                }
            `;
            break;
        case '科技霓虹':
            css += `
                ${btnSelector} {
                    background: linear-gradient(145deg, rgba(0, 25, 50, 0.95), rgba(0, 15, 35, 0.98)) !important;
                    color: #00ffff !important;
                    border: 1.5px solid rgba(0, 255, 255, 0.6) !important;
                    border-radius: 6px !important;
                    padding: 8px 18px !important;
                    box-shadow: 
                        0 0 8px rgba(0, 255, 255, 0.3),
                        0 2px 10px rgba(0, 0, 0, 0.3),
                        inset 0 1px 0 rgba(0, 255, 255, 0.1) !important;
                    text-shadow: 0 0 6px rgba(0, 255, 255, 0.5);
                    transition: all 0.25s ease;
                    font-weight: 600;
                    letter-spacing: 1px;
                    position: relative;
                    overflow: hidden;
                }
                /* 电路线条装饰 - 左侧 */
                ${btnSelector}::before {
                    content: '';
                    position: absolute;
                    left: 6px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 12px;
                    height: 2px;
                    background: rgba(0, 255, 255, 0.5);
                    box-shadow: 
                        0 -6px 0 0 rgba(0, 255, 255, 0.3),
                        0 6px 0 0 rgba(0, 255, 255, 0.3),
                        12px 0 0 0 rgba(0, 255, 255, 0.4),
                        12px -6px 0 0 rgba(0, 255, 255, 0.2);
                }
                /* 电路线条装饰 - 右侧 */
                ${btnSelector}::after {
                    content: '';
                    position: absolute;
                    right: 6px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 12px;
                    height: 2px;
                    background: rgba(0, 255, 255, 0.5);
                    box-shadow: 
                        0 -6px 0 0 rgba(0, 255, 255, 0.3),
                        0 6px 0 0 rgba(0, 255, 255, 0.3),
                        -12px 0 0 0 rgba(0, 255, 255, 0.4),
                        -12px 6px 0 0 rgba(0, 255, 255, 0.2);
                }
                ${btnSelector}:hover {
                    background: linear-gradient(145deg, rgba(0, 35, 60, 0.95), rgba(0, 20, 45, 0.98)) !important;
                    border-color: rgba(0, 255, 255, 0.8) !important;
                    box-shadow: 
                        0 0 15px rgba(0, 255, 255, 0.4),
                        0 4px 15px rgba(0, 0, 0, 0.3),
                        inset 0 1px 0 rgba(0, 255, 255, 0.15) !important;
                    text-shadow: 0 0 10px rgba(0, 255, 255, 0.7);
                    transform: translateY(-1px);
                }
                ${btnSelector}:hover::before,
                ${btnSelector}:hover::after {
                    background: rgba(0, 255, 255, 0.8);
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                    filter: brightness(0.9);
                }
            `;
            break;
        case '极简黑白':
            css += `
                ${btnSelector} {
                    background: #ffffff !important;
                    color: #1a1a1a !important;
                    border: 2px solid #1a1a1a !important;
                    border-radius: 4px !important;
                    padding: 8px 18px !important;
                    text-transform: uppercase;
                    transition: all 0.2s ease;
                    font-weight: 700;
                    letter-spacing: 1.5px;
                    box-shadow: 4px 4px 0px 0px #1a1a1a !important;
                }
                ${btnSelector}:hover {
                    transform: translate(2px, 2px);
                    box-shadow: 2px 2px 0px 0px #1a1a1a !important;
                }
                ${btnSelector}:active {
                    transform: translate(4px, 4px);
                    box-shadow: none !important;
                }
            `;
            break;
        case '玻璃拟态':
            css += `
                ${btnSelector} {
                    background: rgba(255, 255, 255, 0.15) !important;
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.3) !important;
                    border-top: 1px solid rgba(255, 255, 255, 0.5) !important;
                    border-left: 1px solid rgba(255, 255, 255, 0.5) !important;
                    color: white !important;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    transition: all 0.3s ease;
                    font-weight: 500;
                }
                ${btnSelector}:hover {
                    background: rgba(255, 255, 255, 0.25) !important;
                    box-shadow: 0 8px 15px rgba(0, 0, 0, 0.1);
                    transform: translateY(-2px);
                    border-color: rgba(255, 255, 255, 0.6) !important;
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                }
            `;
            // Light mode fallback
            if (!isDark) {
                css += `
                    ${btnSelector} {
                        color: #333 !important;
                        background: rgba(0, 0, 0, 0.08) !important;
                        border: 1px solid rgba(0, 0, 0, 0.15) !important;
                    } 
                    ${btnSelector}:hover {
                        background: rgba(0, 0, 0, 0.15) !important;
                    }
                 `;
            }
            break;

        case '少女心':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #ffb6c1 100%) !important;
                    color: #fff !important;
                    border: 1px solid rgba(255, 255, 255, 0.4) !important;
                    border-radius: 25px !important;
                    padding: 8px 28px 8px 22px !important;
                    box-shadow: 
                        0 4px 15px rgba(255, 154, 158, 0.4),
                        inset 0 2px 0 rgba(255, 255, 255, 0.3),
                        inset 0 -1px 0 rgba(255, 130, 140, 0.2) !important;
                    transition: all 0.25s ease;
                    font-weight: 600;
                    letter-spacing: 0.5px;
                    text-shadow: 0 1px 2px rgba(200, 100, 120, 0.3);
                    position: relative;
                    overflow: visible;
                }
                /* 爱心装饰 */
                ${btnSelector}::before {
                    content: '♥';
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.7);
                    text-shadow: 0 1px 2px rgba(255, 100, 120, 0.4);
                }
                /* 小星星装饰 */
                ${btnSelector}::after {
                    content: '✦';
                    position: absolute;
                    left: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 10px;
                    color: rgba(255, 255, 255, 0.5);
                }
                ${btnSelector}:hover {
                    transform: translateY(-2px);
                    box-shadow: 
                        0 6px 20px rgba(255, 154, 158, 0.5),
                        inset 0 2px 0 rgba(255, 255, 255, 0.35),
                        inset 0 -1px 0 rgba(255, 130, 140, 0.25) !important;
                    filter: brightness(1.03);
                }
                ${btnSelector}:hover::before {
                    color: rgba(255, 255, 255, 0.9);
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                    filter: brightness(0.97);
                }
            `;
            break;
        case '森林系':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, #56ab2f 0%, #7bc043 50%, #a8e063 100%) !important;
                    color: white !important;
                    border: 1px solid rgba(255, 255, 255, 0.15) !important;
                    border-radius: 10px !important;
                    padding: 8px 24px 8px 20px !important;
                    box-shadow: 
                        0 4px 12px rgba(86, 171, 47, 0.35),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2),
                        inset 0 -1px 0 rgba(0, 80, 0, 0.1) !important;
                    transition: all 0.25s ease;
                    font-weight: 600;
                    text-shadow: 0 1px 2px rgba(0, 60, 0, 0.2);
                    position: relative;
                    overflow: visible;
                }
                /* 藤蔓装饰 - 左侧叶子 */
                ${btnSelector}::before {
                    content: '🌿';
                    position: absolute;
                    left: 4px;
                    top: 50%;
                    transform: translateY(-50%) rotate(-15deg);
                    font-size: 11px;
                    opacity: 0.85;
                    filter: drop-shadow(0 1px 1px rgba(0, 50, 0, 0.3));
                }
                /* 右侧小叶子 */
                ${btnSelector}::after {
                    content: '🍃';
                    position: absolute;
                    right: 4px;
                    top: 50%;
                    transform: translateY(-50%) rotate(15deg);
                    font-size: 10px;
                    opacity: 0.75;
                    filter: drop-shadow(0 1px 1px rgba(0, 50, 0, 0.3));
                }
                ${btnSelector}:hover {
                    box-shadow: 
                        0 6px 18px rgba(86, 171, 47, 0.45),
                        inset 0 1px 0 rgba(255, 255, 255, 0.25),
                        inset 0 -1px 0 rgba(0, 80, 0, 0.15) !important;
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }
                ${btnSelector}:hover::before {
                    transform: translateY(-50%) rotate(-20deg);
                }
                ${btnSelector}:hover::after {
                    transform: translateY(-50%) rotate(20deg);
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                    filter: brightness(0.95);
                }
            `;
            break;
        case '星空紫':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, rgba(84, 13, 171, 1) 0%, rgba(60, 80, 180, 1) 50%, rgba(32, 167, 254, 1) 100%) !important;
                    color: white !important;
                    border: 1px solid rgba(255, 255, 255, 0.25) !important;
                    border-radius: 8px !important;
                    padding: 8px 20px !important;
                    box-shadow: 
                        0 4px 15px rgba(84, 13, 171, 0.4),
                        inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
                    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                    transition: all 0.25s ease;
                    font-weight: 600;
                    position: relative;
                    overflow: hidden;
                }
                /* 星星点缀 - 使用box-shadow模拟多个小星点 */
                ${btnSelector}::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: 
                        radial-gradient(circle at 15% 30%, rgba(255, 255, 255, 0.6) 1px, transparent 1px),
                        radial-gradient(circle at 85% 25%, rgba(255, 255, 255, 0.5) 1.5px, transparent 1.5px),
                        radial-gradient(circle at 45% 70%, rgba(255, 255, 255, 0.4) 1px, transparent 1px),
                        radial-gradient(circle at 75% 65%, rgba(255, 255, 255, 0.55) 1px, transparent 1px),
                        radial-gradient(circle at 25% 80%, rgba(255, 255, 255, 0.35) 1.2px, transparent 1.2px),
                        radial-gradient(circle at 90% 75%, rgba(255, 255, 255, 0.45) 0.8px, transparent 0.8px);
                    pointer-events: none;
                }
                /* 装饰性星星符号 */
                ${btnSelector}::after {
                    content: '✦';
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    font-size: 10px;
                    color: rgba(255, 255, 255, 0.6);
                }
                ${btnSelector}:hover {
                    box-shadow: 
                        0 6px 20px rgba(32, 167, 254, 0.5),
                        inset 0 1px 0 rgba(255, 255, 255, 0.25) !important;
                    transform: translateY(-2px);
                    filter: brightness(1.08);
                }
                ${btnSelector}:hover::after {
                    color: rgba(255, 255, 255, 0.9);
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                    filter: brightness(0.95);
                }
            `;
            break;

        case '魔法图标':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, #667eea, #764ba2) !important;
                    color: transparent !important; /* Hide text */
                    width: 40px !important;
                    height: 40px !important;
                    padding: 0 !important;
                    border-radius: 50% !important;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
                    display: inline-flex !important;
                    justify-content: center;
                    align-items: center;
                }
                ${btnSelector}::before {
                    content: '\\f0d0'; /* fa-magic (wand) - ensure FontAwesome is loaded */
                    font-family: "Font Awesome 6 Free", "Font Awesome 5 Free", "FontAwesome";
                    font-weight: 900;
                    color: white;
                    font-size: 18px;
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                ${btnSelector}:hover {
                    transform: rotate(15deg) scale(1.1);
                    box-shadow: 0 6px 15px rgba(102, 126, 234, 0.5);
                }
                ${btnSelector}:active {
                    transform: scale(0.95);
                }
            `;
            break;

        case '赛博几何':
            css += `
                ${btnSelector} {
                    background: #fce300 !important; /* Cyberpunk Yellow */
                    color: #000 !important;
                    border: none !important;
                    padding: 8px 16px !important;
                    clip-path: polygon(10% 0, 100% 0, 100% 70%, 90% 100%, 0 100%, 0 30%);
                    font-family: 'Courier New', Courier, monospace !important;
                    font-weight: 900;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    transition: all 0.2s;
                    position: relative;
                }
                /* Use pseudo-element to replace text content if needed, but CSS can't easily replace text content directly without wrapping. 
                   We will stick to styling the existing text but making it look glitchy. */
                ${btnSelector}:hover {
                    background: #00f0ff !important; /* Cyan */
                    clip-path: polygon(0 0, 90% 0, 100% 30%, 100% 100%, 10% 100%, 0 70%);
                    transform: translate(-2px, -2px);
                    box-shadow: 4px 4px 0px rgba(0,0,0,0.8);
                }
                ${btnSelector}:active {
                    transform: translate(0, 0);
                    box-shadow: none;
                }
            `;
            break;

        case '手绘风格':
            css += `
                ${btnSelector} {
                    background: transparent !important;
                    color: var(--smart-theme-body-color, #333) !important;
                    border: 2px solid var(--smart-theme-body-color, #333) !important;
                    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px !important;
                    padding: 6px 14px !important;
                    transition: all 0.3s ease;
                    font-family: 'Comic Sans MS', 'Chalkboard SE', sans-serif !important;
                    font-weight: bold;
                    box-shadow: 2px 2px 0px 0px rgba(0,0,0,0.1);
                }
                ${btnSelector}:hover {
                    border-radius: 15px 255px 15px 225px / 255px 15px 225px 15px !important;
                    transform: scale(1.05) rotate(-2deg);
                    box-shadow: 3px 3px 5px 0px rgba(0,0,0,0.2);
                }
            `;
            // Dark mode adjustment for visibility
            if (isDark) {
                css += `
                    ${btnSelector} {
                        color: #ddd !important;
                        border-color: #ddd !important;
                    }
                `;
            }
            break;


        case '极简文字':
            css += `
                ${btnSelector} {
                    background: transparent !important;
                    color: #4a90d9 !important; /* Original blue or theme color */
                    border: none !important;
                    padding: 4px 8px !important;
                    position: relative;
                    overflow: visible;
                }
                /* Underline effect */
                ${btnSelector}::after {
                    content: '';
                    position: absolute;
                    width: 0;
                    height: 2px;
                    bottom: 0;
                    left: 0;
                    background-color: #4a90d9;
                    transition: width 0.3s ease;
                }
                ${btnSelector}:hover {
                    background: transparent !important;
                    color: #2c5282 !important; /* Darker blue */
                }
                ${btnSelector}:hover::after {
                    width: 100%;
                }
            `;
            if (isDark) {
                css += `
                    ${btnSelector} {
                         color: #90cdf4 !important; /* Lighter blue for dark mode */
                    }
                    ${btnSelector}::after {
                        background-color: #90cdf4;
                    }
                    ${btnSelector}:hover {
                        color: #63b3ed !important;
                    }
                `;
            }
            break;

        case '冰封水晶':
            css += `
                ${btnSelector} {
                    /* Ice block base */
                    background: rgba(255, 255, 255, 0.15) !important;
                    color: #e0f7fa !important; /* Icy blue text */
                    border: 1px solid rgba(255, 255, 255, 0.6) !important;
                    border-radius: 4px !important;
                    padding: 8px 16px !important;
                    font-weight: bold;
                    text-shadow: 0 1px 2px rgba(0, 100, 255, 0.3);
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    box-shadow: 
                        inset 0 0 10px rgba(255, 255, 255, 0.5), /* Inner glow */
                        inset 2px 2px 5px rgba(255, 255, 255, 0.8), /* Top-left highlight */
                        inset -2px -2px 5px rgba(0, 0, 50, 0.1), /* Bottom-right shadow */
                        0 5px 15px rgba(0, 0, 0, 0.1); /* External shadow */
                    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                    position: relative;
                    overflow: hidden;
                }
                /* Shine effect */
                ${btnSelector}::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: linear-gradient(
                        to bottom right,
                        rgba(255, 255, 255, 0) 0%,
                        rgba(255, 255, 255, 0) 40%,
                        rgba(255, 255, 255, 0.4) 50%,
                        rgba(255, 255, 255, 0) 60%,
                        rgba(255, 255, 255, 0) 100%
                    );
                    transform: rotate(45deg);
                    transition: transform 0.5s;
                    pointer-events: none;
                }
                ${btnSelector}:hover {
                    background: rgba(255, 255, 255, 0.25) !important;
                    transform: translateY(-2px);
                    box-shadow: 
                        inset 0 0 15px rgba(255, 255, 255, 0.6),
                        0 8px 25px rgba(0, 0, 0, 0.15);
                    text-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
                }
                ${btnSelector}:hover::before {
                    transform: rotate(45deg) translate(50%, 50%);
                }
            `;
            break;

        case '流光宝石':
            css += `
                ${btnSelector} {
                    background: 
                        radial-gradient(circle at 25% 25%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 35%),
                        linear-gradient(135deg, #23d5ab 0%, #23a6d5 40%, #9c5bd5 70%, #e73c7e 100%) !important;
                    color: white !important;
                    border: 1px solid rgba(255, 255, 255, 0.25) !important;
                    border-radius: 25px !important;
                    padding: 8px 22px !important;
                    font-weight: 700;
                    letter-spacing: 0.5px;
                    box-shadow: 
                        0 6px 20px rgba(35, 166, 213, 0.3),
                        0 3px 8px rgba(0, 0, 0, 0.15),
                        inset 0 1px 0 rgba(255, 255, 255, 0.35),
                        inset 0 -2px 4px rgba(0, 0, 0, 0.15) !important;
                    transition: all 0.25s ease;
                    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
                }
                ${btnSelector}:hover {
                    box-shadow: 
                        0 8px 25px rgba(35, 166, 213, 0.4),
                        0 4px 12px rgba(0, 0, 0, 0.2),
                        inset 0 1px 0 rgba(255, 255, 255, 0.4),
                        inset 0 -2px 4px rgba(0, 0, 0, 0.18) !important;
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                    filter: brightness(0.95);
                }
            `;
            break;


        case '悬浮胶囊':
            css += `
                ${btnSelector} {
                    background: rgba(255, 255, 255, 0.05) !important;
                    color: var(--smart-theme-body-color, #eee) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1) !important;
                    border-radius: 50px !important;
                    padding: 8px 20px !important;
                    box-shadow: 
                        inset 0 0 10px rgba(0,0,0,0.5),
                        0 0 0 4px rgba(255, 255, 255, 0.05),
                        0 10px 20px rgba(0,0,0,0.3);
                    backdrop-filter: blur(2px);
                    transition: all 0.4s ease;
                    font-weight: 500;
                    letter-spacing: 2px;
                    position: relative;
                }
                ${btnSelector}::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    width: 0%;
                    height: 2px;
                    background: #fff;
                    transform: translate(-50%, -50%);
                    transition: width 0.3s ease;
                    opacity: 0.5;
                    box-shadow: 0 0 10px #fff;
                }
                ${btnSelector}:hover {
                    transform: translateY(-5px);
                    box-shadow: 
                        inset 0 0 20px rgba(0,0,0,0.6),
                        0 0 0 6px rgba(255, 255, 255, 0.1),
                        0 20px 40px rgba(0,0,0,0.4);
                    color: #fff !important;
                    text-shadow: 0 0 8px rgba(255,255,255,0.8);
                }
                ${btnSelector}:hover::after {
                    width: 80%;
                    opacity: 1;
                }
            `;
            if (!isDark) {
                css += `
                    ${btnSelector} {
                        color: #333 !important;
                        border-color: rgba(0,0,0,0.1) !important;
                        background: rgba(0,0,0,0.02) !important;
                        box-shadow: 
                            inset 0 0 10px rgba(0,0,0,0.05),
                            0 0 0 4px rgba(0,0,0,0.02),
                            0 10px 20px rgba(0,0,0,0.1);
                    }
                    ${btnSelector}:hover {
                        box-shadow: 
                            inset 0 0 20px rgba(0,0,0,0.1),
                            0 0 0 6px rgba(0,0,0,0.05),
                            0 20px 40px rgba(0,0,0,0.15);
                    }
                    ${btnSelector}::after {
                        background: #333;
                        box-shadow: 0 0 5px #333;
                    }
                `;
            }
            break;

        case '全息立方':
            css += `
                ${btnSelector} {
                    background: rgba(0, 255, 255, 0.05) !important;
                    color: #0ff !important;
                    border: 1px solid rgba(0, 255, 255, 0.3) !important;
                    padding: 0 16px !important;
                    min-width: 100px !important;
                    height: 40px !important;
                    display: inline-flex !important;
                    justify-content: center;
                    align-items: center;
                    transform-style: preserve-3d;
                    transform: perspective(800px) rotateY(0deg);
                    transition: transform 0.5s ease;
                    position: relative;
                    box-shadow: 0 0 15px rgba(0, 255, 255, 0.1);
                    font-size: 14px !important;
                    font-weight: bold;
                    letter-spacing: 1px;
                    text-shadow: 0 0 5px rgba(0, 255, 255, 0.8);
                }
                ${btnSelector}::before {
                    content: '';
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 255, 255, 0.1);
                    border: 1px solid rgba(0, 255, 255, 0.5);
                    transform: translateZ(20px);
                    pointer-events: none;
                    box-shadow: inset 0 0 10px rgba(0, 255, 255, 0.2);
                }
                ${btnSelector}::after {
                    content: '';
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 255, 255, 0.1);
                    border: 1px solid rgba(0, 255, 255, 0.3);
                    transform: translateZ(-20px);
                    pointer-events: none;
                }
                ${btnSelector}:hover {
                    transform: perspective(800px) rotateX(10deg) rotateY(20deg) scale(1.1);
                    background: rgba(0, 255, 255, 0.1) !important;
                    box-shadow: 0 0 30px rgba(0, 255, 255, 0.4);
                    text-shadow: 0 0 10px rgba(0, 255, 255, 1);
                }
            `;
            break;

        case '赛博方块':
            css += `
                ${btnSelector} {
                    background: linear-gradient(to bottom, #444, #333) !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 0 !important;
                    padding: 8px 16px !important;
                    position: relative;
                    transform-style: preserve-3d;
                    transition: transform 0.1s;
                    font-family: monospace !important;
                    text-transform: uppercase;
                    /* Combined Isometric View */
                    transform: perspective(800px) rotateX(20deg) rotateY(0deg) rotateZ(0deg); 
                    box-shadow: 
                        -1px 0 0 #222, 
                        -2px 0 0 #222, 
                        -3px 0 0 #222, 
                        -4px 0 0 #222, 
                        -5px 0 0 #222, 
                        0 1px 0 #222, 
                        0 2px 0 #222,
                        0 0 0 2px rgba(0,0,0,0.5); /* Outline */
                }
                
                ${btnSelector}:hover {
                    background: linear-gradient(to bottom, #555, #444) !important;
                    color: #0ff !important;
                    text-shadow: 0 0 5px #0ff;
                }
                
                ${btnSelector}:active {
                    /* Press down animation, maintaining perspective but adding translation */
                    transform: perspective(800px) rotateX(20deg) translate(-3px, 3px); 
                    box-shadow: 
                        -1px 0 0 #222, 
                        -2px 0 0 #222, 
                        0 0 0 2px rgba(0,0,0,0.5);
                }
                
                ${btnSelector}::before {
                    content: '';
                    position: absolute;
                    left: 0; 
                    bottom: 0;
                    width: 100%;
                    height: 3px;
                    background: #0ff;
                    opacity: 0.5;
                }
                ${btnSelector}:hover::before {
                    opacity: 1;
                    box-shadow: 0 0 10px #0ff;
                }
            `;
            break;

        /* ========== 图标版本主题 ========== */

        case '森林图标':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, #56ab2f 0%, #7bc043 50%, #a8e063 100%) !important;
                    color: transparent !important;
                    width: 42px !important;
                    height: 42px !important;
                    padding: 0 !important;
                    border-radius: 50% !important;
                    border: 2px solid rgba(255, 255, 255, 0.3) !important;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.25s ease;
                    box-shadow: 
                        0 4px 12px rgba(86, 171, 47, 0.4),
                        inset 0 2px 0 rgba(255, 255, 255, 0.25) !important;
                    display: inline-flex !important;
                    justify-content: center;
                    align-items: center;
                }
                ${btnSelector}::before {
                    content: '\\f4d8'; /* fa-leaf */
                    font-family: "Font Awesome 6 Free", "Font Awesome 5 Free", "FontAwesome";
                    font-weight: 900;
                    color: white;
                    font-size: 18px;
                    text-shadow: 0 1px 2px rgba(0, 60, 0, 0.3);
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                ${btnSelector}:hover {
                    transform: scale(1.1);
                    box-shadow: 
                        0 6px 18px rgba(86, 171, 47, 0.5),
                        inset 0 2px 0 rgba(255, 255, 255, 0.3) !important;
                }
                ${btnSelector}:hover::before {
                    transform: translate(-50%, -50%) rotate(-10deg);
                }
                ${btnSelector}:active {
                    transform: scale(0.95);
                }
            `;
            break;

        case '少女图标':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #ffb6c1 100%) !important;
                    color: transparent !important;
                    width: 42px !important;
                    height: 42px !important;
                    padding: 0 !important;
                    border-radius: 50% !important;
                    border: 2px solid rgba(255, 255, 255, 0.5) !important;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.25s ease;
                    box-shadow: 
                        0 4px 15px rgba(255, 154, 158, 0.45),\
                        inset 0 2px 0 rgba(255, 255, 255, 0.35) !important;
                    display: inline-flex !important;
                    justify-content: center;
                    align-items: center;
                }
                ${btnSelector}::before {
                    content: '\\f004'; /* fa-heart */
                    font-family: "Font Awesome 6 Free", "Font Awesome 5 Free", "FontAwesome";
                    font-weight: 900;
                    color: white;
                    font-size: 18px;
                    text-shadow: 0 1px 3px rgba(200, 100, 120, 0.4);
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                ${btnSelector}:hover {
                    transform: scale(1.1);
                    box-shadow: 
                        0 6px 20px rgba(255, 154, 158, 0.55),\
                        inset 0 2px 0 rgba(255, 255, 255, 0.4) !important;
                }
                ${btnSelector}:hover::before {
                    transform: translate(-50%, -50%) scale(1.15);
                }
                ${btnSelector}:active {
                    transform: scale(0.95);
                }
            `;
            break;

        case '星空图标':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, rgba(84, 13, 171, 1) 0%, rgba(60, 80, 180, 1) 50%, rgba(32, 167, 254, 1) 100%) !important;
                    color: transparent !important;
                    width: 42px !important;
                    height: 42px !important;
                    padding: 0 !important;
                    border-radius: 50% !important;
                    border: 2px solid rgba(255, 255, 255, 0.25) !important;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.25s ease;
                    box-shadow: 
                        0 4px 15px rgba(84, 13, 171, 0.45),\
                        inset 0 2px 0 rgba(255, 255, 255, 0.2) !important;
                    display: inline-flex !important;
                    justify-content: center;
                    align-items: center;
                }
                /* 背景星点装饰 */
                ${btnSelector}::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: 
                        radial-gradient(circle at 20% 25%, rgba(255, 255, 255, 0.5) 1px, transparent 1px),\
                        radial-gradient(circle at 75% 70%, rgba(255, 255, 255, 0.4) 1px, transparent 1px),\
                        radial-gradient(circle at 85% 20%, rgba(255, 255, 255, 0.35) 0.8px, transparent 0.8px);
                    pointer-events: none;
                }
                ${btnSelector}::before {
                    content: '\\f005'; /* fa-star */
                    font-family: "Font Awesome 6 Free", "Font Awesome 5 Free", "FontAwesome";
                    font-weight: 900;
                    color: white;
                    font-size: 18px;
                    text-shadow: 0 0 8px rgba(255, 255, 255, 0.6);
                    z-index: 1;
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                ${btnSelector}:hover {
                    transform: scale(1.1);
                    box-shadow: 
                        0 6px 20px rgba(32, 167, 254, 0.5),\
                        inset 0 2px 0 rgba(255, 255, 255, 0.25) !important;
                }
                ${btnSelector}:hover::before {
                    text-shadow: 0 0 12px rgba(255, 255, 255, 0.9);
                }
                ${btnSelector}:active {
                    transform: scale(0.95);
                }
            `;
            break;

        case '霓虹图标':
            css += `
                ${btnSelector} {
                    background: linear-gradient(145deg, rgba(0, 25, 50, 0.98), rgba(0, 15, 35, 1)) !important;
                    color: transparent !important;
                    width: 42px !important;
                    height: 42px !important;
                    padding: 0 !important;
                    border-radius: 50% !important;
                    border: 2px solid rgba(0, 255, 255, 0.5) !important;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.25s ease;
                    box-shadow: 
                        0 0 10px rgba(0, 255, 255, 0.3),\
                        0 4px 12px rgba(0, 0, 0, 0.4),\
                        inset 0 0 8px rgba(0, 255, 255, 0.1) !important;
                    display: inline-flex !important;
                    justify-content: center;
                    align-items: center;
                }
                ${btnSelector}::before {
                    content: '\\f0e7'; /* fa-bolt */
                    font-family: "Font Awesome 6 Free", "Font Awesome 5 Free", "FontAwesome";
                    font-weight: 900;
                    color: #00ffff;
                    font-size: 18px;
                    text-shadow: 0 0 8px rgba(0, 255, 255, 0.8);
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                ${btnSelector}:hover {
                    transform: scale(1.1);
                    border-color: rgba(0, 255, 255, 0.8) !important;
                    box-shadow: 
                        0 0 18px rgba(0, 255, 255, 0.5),\
                        0 6px 15px rgba(0, 0, 0, 0.4),\
                        inset 0 0 12px rgba(0, 255, 255, 0.15) !important;
                }
                ${btnSelector}:hover::before {
                    text-shadow: 0 0 15px rgba(0, 255, 255, 1);
                }
                ${btnSelector}:active {
                    transform: scale(0.95);
                }
            `;
            break;

        case '宝石图标':
            css += `
                ${btnSelector} {
                    background: 
                        radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0) 40%),
                        linear-gradient(135deg, #23d5ab 0%, #23a6d5 40%, #9c5bd5 70%, #e73c7e 100%) !important;
                    color: transparent !important;
                    width: 42px !important;
                    height: 42px !important;
                    padding: 0 !important;
                    border-radius: 50% !important;
                    border: 2px solid rgba(255, 255, 255, 0.3) !important;
                    position: relative;
                    overflow: hidden;
                    transition: all 0.25s ease;
                    box-shadow: 
                        0 5px 18px rgba(35, 166, 213, 0.4),\
                        0 3px 8px rgba(0, 0, 0, 0.2),\
                        inset 0 1px 0 rgba(255, 255, 255, 0.4),\
                        inset 0 -2px 4px rgba(0, 0, 0, 0.15) !important;
                    display: inline-flex !important;
                    justify-content: center;
                    align-items: center;
                }
                ${btnSelector}::before {
                    content: '\\f3a5'; /* fa-gem */
                    font-family: "Font Awesome 6 Free", "Font Awesome 5 Free", "FontAwesome";
                    font-weight: 400; /* Regular style for gem */
                    color: white;
                    font-size: 18px;
                    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                }
                ${btnSelector}:hover {
                    transform: scale(1.1);
                    box-shadow: 
                        0 7px 22px rgba(35, 166, 213, 0.5),\
                        0 4px 10px rgba(0, 0, 0, 0.25),\
                        inset 0 1px 0 rgba(255, 255, 255, 0.5),\
                        inset 0 -2px 4px rgba(0, 0, 0, 0.18) !important;
                }
                ${btnSelector}:hover::before {
                    transform: translate(-50%, -50%) rotate(15deg);
                }
                ${btnSelector}:active {
                    transform: scale(0.95);
                }
            `;
            break;

        /* ========== 自然元素主题 ========== */

        case '原木质感':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, #8B4513 0%, #A0522D 25%, #CD853F 50%, #A0522D 75%, #8B4513 100%) !important;
                    color: #fff8dc !important;
                    border: 2px solid #5D3A1A !important;
                    border-radius: 6px !important;
                    padding: 8px 20px !important;
                    box-shadow: 
                        0 4px 10px rgba(93, 58, 26, 0.4),\
                        inset 0 1px 0 rgba(255, 255, 255, 0.15),\
                        inset 0 -1px 0 rgba(0, 0, 0, 0.2) !important;
                    transition: all 0.25s ease;
                    font-weight: 600;
                    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                    position: relative;
                    overflow: hidden;
                }
                /* 木纹条纹装饰 */
                ${btnSelector}::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: 
                        repeating-linear-gradient(
                            90deg,
                            transparent 0px,
                            transparent 8px,
                            rgba(0, 0, 0, 0.05) 8px,
                            rgba(0, 0, 0, 0.05) 9px
                        ),\
                        repeating-linear-gradient(
                            0deg,
                            transparent 0px,
                            transparent 3px,
                            rgba(255, 255, 255, 0.03) 3px,
                            rgba(255, 255, 255, 0.03) 4px
                        );
                    pointer-events: none;
                }
                /* 木节装饰 */
                ${btnSelector}::after {
                    content: '';
                    position: absolute;
                    right: 8px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 8px;
                    height: 8px;
                    background: radial-gradient(circle, #5D3A1A 0%, #8B4513 60%, transparent 70%);
                    border-radius: 50%;
                    opacity: 0.6;
                }
                ${btnSelector}:hover {
                    box-shadow: 
                        0 6px 15px rgba(93, 58, 26, 0.5),\
                        inset 0 1px 0 rgba(255, 255, 255, 0.2),\
                        inset 0 -1px 0 rgba(0, 0, 0, 0.25) !important;
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                    filter: brightness(0.95);
                }
            `;
            break;

        case '云朵白':
            css += `
                ${btnSelector} {
                    background: linear-gradient(180deg, #ffffff 0%, #f0f4f8 50%, #e8ecf0 100%) !important;
                    color: #5a6a7a !important;
                    border: none !important;
                    border-radius: 25px !important;
                    padding: 8px 22px !important;
                    box-shadow: 
                        0 6px 20px rgba(0, 0, 0, 0.08),\
                        0 2px 6px rgba(0, 0, 0, 0.04),\
                        inset 0 2px 0 rgba(255, 255, 255, 1),\
                        inset 0 -2px 4px rgba(0, 0, 0, 0.03) !important;
                    transition: all 0.3s ease;
                    font-weight: 600;
                    position: relative;
                    overflow: visible;
                }
                /* 云朵蓬松边缘 - 左侧 */
                ${btnSelector}::before {
                    content: '';
                    position: absolute;
                    left: -6px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 14px;
                    height: 14px;
                    background: linear-gradient(180deg, #ffffff 0%, #f0f4f8 100%);
                    border-radius: 50%;
                    box-shadow: 
                        0 3px 8px rgba(0, 0, 0, 0.06),\
                        inset 0 1px 0 rgba(255, 255, 255, 1);
                }
                /* 云朵蓬松边缘 - 右侧 */
                ${btnSelector}::after {
                    content: '';
                    position: absolute;
                    right: -6px;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 14px;
                    height: 14px;
                    background: linear-gradient(180deg, #ffffff 0%, #f0f4f8 100%);
                    border-radius: 50%;
                    box-shadow: 
                        0 3px 8px rgba(0, 0, 0, 0.06),\
                        inset 0 1px 0 rgba(255, 255, 255, 1);
                }
                ${btnSelector}:hover {
                    transform: translateY(-3px);
                    box-shadow: 
                        0 10px 30px rgba(0, 0, 0, 0.1),\
                        0 4px 10px rgba(0, 0, 0, 0.05),\
                        inset 0 2px 0 rgba(255, 255, 255, 1),\
                        inset 0 -2px 4px rgba(0, 0, 0, 0.03) !important;
                }
                ${btnSelector}:active {
                    transform: translateY(-1px);
                }
            `;
            break;

        case '水流蓝':
            css += `
                ${btnSelector} {
                    background: linear-gradient(135deg, #00b4db 0%, #0083b0 50%, #00b4db 100%) !important;
                    color: white !important;
                    border: 1px solid rgba(255, 255, 255, 0.3) !important;
                    border-radius: 20px !important;
                    padding: 8px 22px !important;
                    box-shadow: 
                        0 4px 15px rgba(0, 131, 176, 0.4),\
                        inset 0 2px 0 rgba(255, 255, 255, 0.25),\
                        inset 0 -1px 0 rgba(0, 0, 0, 0.1) !important;
                    transition: all 0.25s ease;
                    font-weight: 600;
                    text-shadow: 0 1px 2px rgba(0, 50, 80, 0.3);
                    position: relative;
                    overflow: hidden;
                }
                /* 波浪纹理 */
                ${btnSelector}::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: 
                        repeating-linear-gradient(
                            -45deg,
                            transparent 0px,
                            transparent 4px,
                            rgba(255, 255, 255, 0.08) 4px,
                            rgba(255, 255, 255, 0.08) 8px
                        );
                    pointer-events: none;
                }
                /* 水滴高光 */
                ${btnSelector}::after {
                    content: '';
                    position: absolute;
                    left: 10px;
                    top: 6px;
                    width: 6px;
                    height: 6px;
                    background: radial-gradient(circle, rgba(255, 255, 255, 0.8) 0%, transparent 70%);
                    border-radius: 50%;
                }
                ${btnSelector}:hover {
                    box-shadow: 
                        0 6px 20px rgba(0, 131, 176, 0.5),\
                        inset 0 2px 0 rgba(255, 255, 255, 0.3),\
                        inset 0 -1px 0 rgba(0, 0, 0, 0.15) !important;
                    transform: translateY(-2px);
                    filter: brightness(1.05);
                }
                ${btnSelector}:active {
                    transform: translateY(0);
                    filter: brightness(0.95);
                }
            `;
            break;

        default:
            css += '';
            break;
    }

    styleEl.textContent = css;

    // 缓存当前 CSS 用于 iframe 注入
    currentButtonStyleCSS = css;
}