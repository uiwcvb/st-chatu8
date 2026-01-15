// @ts-nocheck
import { json, json2, json3, jsonvae, jsonweilinvae, jsonweldf } from "./settings/workers.js";
import { themePresets } from "./settings/themePresets.js";

export const extensionName = "st-chatu8";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

export const EventType = {
    GENERATE_IMAGE_REQUEST: 'generate-st-chatu8-image-request',
    GENERATE_IMAGE_RESPONSE: 'generate-st-chatu8-image-response',
};

export const eventNames = {
    REGEX_TEST_MESSAGE: 'regex-st-chatu8-test-message',
    REGEX_RESULT_MESSAGE: 'regex-st-chatu8-result-message',
    // LLM 相关事件
    LLM_TEST_RESULT: 'ch-llm-test-result',
    LLM_GET_PROMPT_REQUEST: 'ch-llm-get-prompt-request',
    LLM_GET_PROMPT_RESPONSE: 'ch-llm-get-prompt-response',
    LLM_EXECUTE_REQUEST: 'ch-llm-execute-request',
    LLM_EXECUTE_RESPONSE: 'ch-llm-execute-response',

    // 四种 LLM 请求类型事件
    // 正文图片生成
    LLM_IMAGE_GEN_REQUEST: 'ch-llm-image-gen-request',
    LLM_IMAGE_GEN_RESPONSE: 'ch-llm-image-gen-response',
    LLM_IMAGE_GEN_GET_PROMPT_REQUEST: 'ch-llm-image-gen-get-prompt-request',
    LLM_IMAGE_GEN_GET_PROMPT_RESPONSE: 'ch-llm-image-gen-get-prompt-response',
    // 角色设计和服装设计
    LLM_CHAR_DESIGN_REQUEST: 'ch-llm-char-design-request',
    LLM_CHAR_DESIGN_RESPONSE: 'ch-llm-char-design-response',
    LLM_CHAR_DESIGN_GET_PROMPT_REQUEST: 'ch-llm-char-design-get-prompt-request',
    LLM_CHAR_DESIGN_GET_PROMPT_RESPONSE: 'ch-llm-char-design-get-prompt-response',
    // 角色和服装展示
    LLM_CHAR_DISPLAY_REQUEST: 'ch-llm-char-display-request',
    LLM_CHAR_DISPLAY_RESPONSE: 'ch-llm-char-display-response',
    LLM_CHAR_DISPLAY_GET_PROMPT_REQUEST: 'ch-llm-char-display-get-prompt-request',
    LLM_CHAR_DISPLAY_GET_PROMPT_RESPONSE: 'ch-llm-char-display-get-prompt-response',
    // 角色/服装修改
    LLM_CHAR_MODIFY_REQUEST: 'ch-llm-char-modify-request',
    LLM_CHAR_MODIFY_RESPONSE: 'ch-llm-char-modify-response',
    LLM_CHAR_MODIFY_GET_PROMPT_REQUEST: 'ch-llm-char-modify-get-prompt-request',
    LLM_CHAR_MODIFY_GET_PROMPT_RESPONSE: 'ch-llm-char-modify-get-prompt-response',
    // 翻译请求事件
    LLM_TRANSLATION_REQUEST: 'ch-llm-translation-request',
    LLM_TRANSLATION_RESPONSE: 'ch-llm-translation-response',
    LLM_TRANSLATION_GET_PROMPT_REQUEST: 'ch-llm-translation-get-prompt-request',
    LLM_TRANSLATION_GET_PROMPT_RESPONSE: 'ch-llm-translation-get-prompt-response',
    // Tag修改请求事件
    LLM_TAG_MODIFY_REQUEST: 'ch-llm-tag-modify-request',
    LLM_TAG_MODIFY_RESPONSE: 'ch-llm-tag-modify-response',
    LLM_TAG_MODIFY_GET_PROMPT_REQUEST: 'ch-llm-tag-modify-get-prompt-request',
    LLM_TAG_MODIFY_GET_PROMPT_RESPONSE: 'ch-llm-tag-modify-get-prompt-response',
};

// LLM 请求类型枚举
export const LLMRequestTypes = {
    IMAGE_GEN: 'image_gen',         // 正文图片生成
    CHAR_DESIGN: 'char_design',     // 角色设计和服装设计
    CHAR_DISPLAY: 'char_display',   // 角色和服装展示
    CHAR_MODIFY: 'char_modify',     // 角色/服装修改
    TRANSLATION: 'translation',     // 翻译
    TAG_MODIFY: 'tag_modify',       // Tag修改
};



// 导出主题预设供其他模块使用
export const defaultThemes = themePresets;

export const defaultSettings = {
    theme_id: '默认-夜间',
    themes: defaultThemes,
    generate_btn_style: '默认',
    scriptEnabled: false,
    characterAI: { model: "mistral", temperature: 0.8, systemPrompt: "", lastPrompt: "" },
    outfitAI: { model: "mistral", temperature: 0.8, systemPrompt: "", lastPrompt: "" },

    newlineFixEnabled: "true",
    yushe: { "默认": { "fixedPrompt": '', "fixedPrompt_end": '', "negativePrompt": '' }, "小马模型默认": { "fixedPrompt": 'score_9,score_8_up,score_7_up,anime', "fixedPrompt_end": '', "negativePrompt": 'score_4,score_3,score_2,score_1,score_5' } },
    yusheid_sd: "默认",
    yusheid_novelai: "默认",
    yusheid_comfyui: "默认",
    prompt_replace: { "默认": { "text": '触发词1=前置前|插入词1\n触发词2=前置后|插入词2\n触发词3=替换|替换词3\n触发词4=替换|\n触发词5=替换分角色|替换词5\n触发词6=后置前|插入词6\n触发词7=后置后|插入词7\n触发词8=最后置|插入词8' } },
    prompt_replace_id: "默认",
    regex_profiles: { "默认": { beforeAfterRegex: '', textRegex: '' } },
    current_regex_profile: "默认",
    regexTestMode: false,
    mode: 'comfyui',
    client: 'browser',
    cache: "1",
    sdUrl: 'http://localhost:7860',
    st_chatu8_sd_auth: '',
    comfyuiUrl: 'http://localhost:8188',
    novelaiApi: '000000',
    novelaiApi_id: '000000',
    startTag: 'image###',
    endTag: '###',
    nai3Scale: '10',
    sdCfgScale: '7',
    sm: "true",
    dyn: 'true',
    cfg_rescale: '0.18',
    AQT_sd: 'best quality, amazing quality, very aesthetic, absurdres',
    UCP_sd: 'bad proportions, out of focus, username, text, bad anatomy, lowres, worstquality, watermark, cropped, bad body, deformed, mutated, disfigured, poorly drawn face, malformed hands, extra arms, extra limb, missing limb, too many fingers, extra legs, bad feet, missing fingers, fused fingers, acnes, floating limbs, disconnected limbs, long neck, long body, mutation, ugly, blurry, low quality, sketches, normal quality, monochrome, grayscale, signature, logo, jpeg artifacts, unfinished, displeasing, chromatic aberration, extra digits, artistic error, scan, abstract, photo, realism, screencap',
    AQT_novelai: 'best quality, amazing quality, very aesthetic, absurdres',
    UCP_novelai: 'Heavy',
    addFurryDataset: 'false',
    AQT_comfyui: 'best quality, amazing quality, very aesthetic, absurdres',
    UCP_comfyui: 'bad proportions, out of focus, username, text, bad anatomy, lowres, worstquality, watermark, cropped, bad body, deformed, mutated, disfigured, poorly drawn face, malformed hands, extra arms, extra limb, missing limb, too many fingers, extra legs, bad feet, missing fingers, fused fingers, acnes, floating limbs, disconnected limbs, long neck, long body, mutation, ugly, blurry, low quality, sketches, normal quality, monochrome, grayscale, signature, logo, jpeg artifacts, unfinished, displeasing, chromatic aberration, extra digits, artistic error, scan, abstract, photo, realism, screencap',
    sd_csteps: '28',
    sd_cwidth: '1024',
    sd_cheight: '1024',
    sd_cseed: '-1',
    novelai_steps: '28',
    novelai_width: '1024',
    novelai_height: '1024',
    novelai_seed: '0',
    comfyui_steps: '28',
    comfyui_width: '1024',
    comfyui_height: '1024',
    comfyui_seed: '0',
    cfg_comfyui: '6',
    sd_cchatu_8_model: '连接后选择',
    sd_cchatu_8_vae: 'Automatic',
    sd_cchatu_8_scheduler: '连接后选择',
    sd_cchatu_8_upscaler: 'Latent',
    sd_cupscale_factor: '1',
    sd_chires_fix: 'false',
    sd_chires_steps: '0',
    sd_cdenoising_strength: '0.7',
    sd_cclip_skip: '2',
    sd_cadetailer: 'false',
    restoreFaces: 'false',
    sd_cchatu_8_samplerName: 'DPM++ 2M',
    comfyuisamplerName: '连接后选择',
    comfyuiCLIPName: '连接后选择',
    comfyui_scheduler: '连接后选择',
    comfyui_vae: '连接后选择',
    novelai_sampler: "k_euler",
    zidongdianji: "false",
    zidongdianji2: "false",
    longPressToEdit: "false",
    clickToPreview: "true",
    nai3VibeTransfer: "false",
    nai3CharRef: "false",
    nai3StylePerception: "false",
    InformationExtracted: '0.3',
    ReferenceStrength: "0.6",
    nai3Deceisp: "true",
    nai3Variety: "true",
    Schedule: "native",
    MODEL_NAME: "连接后选择",
    c_fenwei: "0.8",
    c_xijie: "0.8",
    c_idquanzhong: "1.10",
    c_quanzhong: "0.8",
    ipa: "STANDARD (medium strength)",
    dbclike: "false",
    workers: {
        "默认": json,
        "默认-独立VAE": jsonvae,
        "默认人物一致": json2,
        "面部细化": json3,
        "新版默认": jsonweldf,
        "新weilin-vae": jsonweilinvae,
    },
    workerid: "新版默认",
    worker: jsonweldf,
    novelaimode: "nai-diffusion-4-5-full",
    novelaisite: "官网",
    novelaiOtherSite: "http://localhost:9696/get-new-token",
    displayMode: "默认",
    heavyFrontendMode: "false",
    enablePregen: "false",
    imageGenInterval: 1000,  // 生图间隔，单位毫秒
    imageAlignment: 'center',  // 图片对齐方式：left（靠左）、center（居中）、right（靠右）
    ai_model: 'mistral',
    ai_temperature: 1,
    ai_top_p: 1.0,
    ai_presence_penalty: 0.0,
    ai_frequency_penalty: 0.0,
    ai_stream: 'false',
    ai_private: 'true',
    ai_token: '',
    ai_test_system: 'You are a helpful assistant.',
    ai_test_user: 'What is the capital of France?',
    ai_test_output: '',

    llm_history_depth: 2,  // 发送历史层数，0表示不发送历史

    llm_profiles: {
        "默认": {
            api_url: "",
            api_key: "",
            model: "",
            temperature: 1.0,
            top_p: 1.0,
            max_tokens: 30000,
            stream: false
        }
    },
    current_llm_profile: "默认",

    // 四种请求类型的配置 - 通过选择预设来配置
    llm_request_type_configs: {
        // 正文图片生成
        image_gen: {
            api_profile: "默认",      // 选择的 LLM API 配置预设名称
            context_profile: "默认"   // 选择的测试上下文预设名称
        },
        // 角色设计和服装设计
        char_design: {
            api_profile: "默认",
            context_profile: "默认"
        },
        // 角色和服装展示
        char_display: {
            api_profile: "默认",
            context_profile: "默认"
        },
        // 角色/服装修改
        char_modify: {
            api_profile: "默认",
            context_profile: "默认"
        },
        // 翻译
        translation: {
            api_profile: "默认",
            context_profile: "默认"
        },
        // Tag修改
        tag_modify: {
            api_profile: "默认",
            context_profile: "默认"
        }
    },

    // 测试上下文配置(独立于LLM配置) - 新版本使用条目列表
    test_context_profiles: {
        "默认": {
            entries: [
                {
                    id: 'entry_1',
                    name: '系统提示',
                    role: 'system',      // 'system' | 'user' | 'assistant'
                    content: '',
                    enabled: true,
                    triggerMode: 'always', // 'always' | 'trigger'
                    triggerWords: ''       // 触发词（逗号分隔），仅在 triggerMode 为 'trigger' 时使用
                }
            ]
        }
    },
    current_test_context_profile: "默认",
    llmTestMode: false,

    // 翻译设置
    translation_model: 'mistral',
    translation_system_prompt: '你是标签翻译助手。将输入的英文标签翻译成中文。\n\n输出格式：JSON对象 {"英文":"中文", ...}\n\n规则：\n1. 保持输入顺序\n2. 只输出JSON，不加任何解释\n3. 确保JSON格式正确\n\n示例：\n输入：1girl, long hair, blue eyes\n输出：{"1girl":"一个女孩","long hair":"长发","blue eyes":"蓝色眼睛"}',

    AI_use_coords: "true",

    // 悬浮球主题预设
    fabThemes: {
        "自定义": {
            bgColor: '#ADD8E6',
            iconColor: '#FFFFFF',
            opacity: 1
        },
        "天空蓝": {
            bgColor: '#87CEEB',
            iconColor: '#FFFFFF',
            opacity: 0.9
        },
        "薄荷绿": {
            bgColor: '#98FB98',
            iconColor: '#2F4F4F',
            opacity: 0.85
        },
        "樱花粉": {
            bgColor: '#FFB7C5',
            iconColor: '#FFFFFF',
            opacity: 0.9
        },
        "暗夜紫": {
            bgColor: '#6A5ACD',
            iconColor: '#FFFFFF',
            opacity: 0.85
        },
        "琥珀橙": {
            bgColor: '#FFBF00',
            iconColor: '#4A3728',
            opacity: 0.9
        },
        "深邃黑": {
            bgColor: '#2C3E50',
            iconColor: '#ECF0F1',
            opacity: 0.9
        },
        "玻璃态": {
            bgColor: '#FFFFFF',
            iconColor: '#333333',
            opacity: 0.5
        },
        "荧光绿": {
            bgColor: '#39FF14',
            iconColor: '#000000',
            opacity: 0.8
        },
        "玫瑰金": {
            bgColor: '#B76E79',
            iconColor: '#FFFFFF',
            opacity: 0.9
        }
    },
    chatu8_fab_theme: '自定义',

    enable_chatu8_fab: true,
    chatu8_fab_bg_color: '#ADD8E6',
    chatu8_fab_icon_color: '#FFFFFF',
    chatu8_fab_opacity: 1,
    chatu8_fab_size: 40,
    chatu8_fab_position: {
        desktop: { top: '65vh', left: '20px' },
        mobile: { top: '80vh', left: '10px' }
    },
    lastTab: 'main',
    comfyuiCache: {
        models: [],
        samplers: [],
        vaes: [],
        schedulers: [],
        loras: [],
        CLIPs: [],
        objectInfo: {}  // 完整的节点类型定义，用于可视化属性面板
    },
    sdCache: {
        models: [],
        samplers: [],
        vaes: [],
        schedulers: [],
        upscalers: [],
        loras: []
    },
    worldBookEnabled: "false",
    worldBookList: { "默认添加末尾": { "content": "" } },
    ai_test_system: ""
    ,
    ai_test_system_prompt: "",
    ai_test_output: "",
    worldBookList_id: "默认添加末尾",
    vocabulary_search_startswith: "false",
    vocabulary_search_limit: 100,
    vocabulary_search_sort: 'hot_desc',
    jiuguanchucun: "false",
    jiuguanStorage: {},
    banana: {
        apiKey: '123456',
        apiUrl: 'http://localhost:8008',
        model: 'gemini-2.5-flash-image',
        aspectRatio: '1:1',
        conversationPresetId: '默认',
        editPresetId: '默认',
        conversationPresets: {
            "默认": {
                fixedPrompt: '',
                postfixPrompt: '',
                conversation: [
                    { user: { text: '', image: '' }, model: { text: '', image: '' } },
                    { user: { text: '', image: '' }, model: { text: '', image: '' } },
                    { user: { text: '', image: '' }, model: { text: '', image: '' } }
                ]
            }
        },
    },
    bananaCharacterPresets: {
        "默认": {
            triggers: "触发词1|触发词2",
            conversation: {
                user: { text: '', image: '' },
                model: { text: '', image: '' }
            }
        }
    },
    bananaCharacterPresetId: '默认',
    gestureEnabled: false,
    clickTriggerEnabled: false,
    gesture1: [
        '1100000000',
        '1100000000',
        '1100000000',
        '1100000000',
        '1100000000',
        '1100000000',
        '1100000000',
        '1111111111',
        '1111111111',
        '0000000000',
    ],
    gesture2: [
        '0000000000',
        '1111111111',
        '1111111111',
        '1100000000',
        '1100000000',
        '1100000000',
        '1100000000',
        '1100000000',
        '1100000000',
        '1100000000',
    ],
    gestureShowRecognition: true,
    gestureShowTrail: true,
    gestureTrailColor: '#00ff00',
    gestureMatchThreshold: 60,
    defaultCharDemand: '',
    defaultImageDemand: '',
};

export const aiModels = [{ "name": "deepseek", "description": "DeepSeek V3.1 (Google Vertex AI)", "tier": "seed", "community": false, "aliases": ["deepseek-v3", "deepseek-v3.1", "deepseek-ai/deepseek-v3.1-maas"], "input_modalities": ["text"], "output_modalities": ["text"], "tools": true, "vision": false, "audio": false }, { "name": "deepseek-reasoning", "description": "DeepSeek R1 0528", "maxInputChars": 5000, "reasoning": true, "tier": "seed", "community": false, "aliases": ["deepseek-r1-0528", "us.deepseek.r1-v1:0"], "input_modalities": ["text"], "output_modalities": ["text"], "tools": false, "vision": false, "audio": false }, { "name": "gemini", "description": "Gemini 2.5 Flash Lite (Vertex AI)", "tier": "seed", "community": false, "aliases": ["gemini-2.5-flash-lite"], "input_modalities": ["text", "image"], "output_modalities": ["text"], "tools": true, "vision": true, "audio": false }, { "name": "gemini-search", "description": "Gemini 2.5 Flash with Google Search (Google Vertex AI)", "tier": "seed", "community": false, "aliases": ["searchgpt", "geminisearch"], "input_modalities": ["text", "image"], "output_modalities": ["text"], "tools": true, "vision": true, "audio": false }, { "name": "mistral", "description": "Mistral Small 3.1 24B", "tier": "anonymous", "community": false, "aliases": ["mistral-small-3.1-24b-instruct", "mistral-small-3.1-24b-instruct-2503"], "input_modalities": ["text"], "output_modalities": ["text"], "tools": true, "vision": false, "audio": false }, { "name": "nova-fast", "description": "Amazon Nova Micro", "community": false, "tier": "anonymous", "aliases": ["nova-micro-v1"], "input_modalities": ["text"], "output_modalities": ["text"], "tools": true, "vision": false, "audio": false }, { "name": "openai", "description": "OpenAI GPT-5 Mini", "tier": "anonymous", "community": false, "aliases": ["gpt-5-mini"], "input_modalities": ["text", "image"], "output_modalities": ["text"], "tools": true, "maxInputChars": 7000, "vision": true, "audio": false }, { "name": "openai-audio", "description": "OpenAI GPT-4o Mini Audio Preview", "maxInputChars": 10000, "voices": ["alloy", "echo", "fable", "onyx", "nova", "shimmer", "coral", "verse", "ballad", "ash", "sage", "amuch", "dan"], "tier": "seed", "community": false, "aliases": ["gpt-4o-mini-audio-preview"], "input_modalities": ["text", "image", "audio"], "output_modalities": ["audio", "text"], "tools": true, "vision": true, "audio": true }, { "name": "openai-fast", "description": "OpenAI GPT-5 Nano", "tier": "anonymous", "community": false, "aliases": ["gpt-5-nano"], "input_modalities": ["text", "image"], "output_modalities": ["text"], "tools": true, "maxInputChars": 5000, "vision": true, "audio": false }, { "name": "openai-large", "description": "OpenAI GPT-5 Chat", "maxInputChars": 10000, "tier": "seed", "community": false, "aliases": ["gpt-5-chat"], "input_modalities": ["text", "image"], "output_modalities": ["text"], "tools": true, "vision": true, "audio": false }, { "name": "openai-reasoning", "description": "OpenAI o4-mini (Azure Myceli)", "tier": "seed", "community": false, "aliases": ["o4-mini"], "reasoning": true, "supportsSystemMessages": false, "input_modalities": ["text", "image"], "output_modalities": ["text"], "tools": true, "vision": true, "audio": false }, { "name": "qwen-coder", "description": "Qwen 2.5 Coder 32B", "tier": "anonymous", "community": false, "aliases": ["qwen2.5-coder-32b-instruct"], "input_modalities": ["text"], "output_modalities": ["text"], "tools": true, "vision": false, "audio": false }, { "name": "roblox-rp", "description": "Llama 3.1 8B Instruct (Cross-Region)", "tier": "seed", "community": false, "aliases": ["llama-roblox", "llama-fast-roblox"], "input_modalities": ["text"], "output_modalities": ["text"], "tools": true, "vision": false, "audio": false }, { "name": "bidara", "description": "BIDARA (Biomimetic Designer and Research Assistant by NASA)", "tier": "anonymous", "community": true, "input_modalities": ["text", "image"], "output_modalities": ["text"], "tools": true, "vision": true, "audio": false }, { "name": "chickytutor", "description": "ChickyTutor AI Language Tutor - (chickytutor.com)", "tier": "anonymous", "community": true, "input_modalities": ["text"], "output_modalities": ["text"], "tools": true, "vision": false, "audio": false }, { "name": "evil", "description": "Evil", "uncensored": true, "tier": "seed", "community": true, "input_modalities": ["text", "image"], "output_modalities": ["text"], "tools": true, "vision": true, "audio": false }, { "name": "midijourney", "description": "MIDIjourney", "tier": "anonymous", "community": true, "input_modalities": ["text"], "output_modalities": ["text"], "tools": true, "vision": false, "audio": false }, { "name": "rtist", "description": "Rtist", "tier": "seed", "community": true, "input_modalities": ["text"], "output_modalities": ["text"], "tools": true, "vision": false, "audio": false }, { "name": "unity", "description": "Unity Unrestricted Agent", "uncensored": true, "tier": "seed", "community": true, "input_modalities": ["text", "image"], "output_modalities": ["text"], "tools": true, "vision": true, "audio": false }];
