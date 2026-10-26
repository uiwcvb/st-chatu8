/**
 * st-chatu8 MOSS compatibility changes by Codex, 2026-10-26.
 * Preserves the original author's copyright and AFPL v9 (see LICENSE).
 * Purpose: preserve fixed workflows and MOSS text, discover modern loaders,
 * and turn MOSS LoRA tags into actual model-only nodes without WeiLin.
 */
const clone = (value) => JSON.parse(JSON.stringify(value));
const nodeEntries = (workflow) => Object.entries(workflow || {}).filter(([, n]) => n && typeof n.class_type === "string" && n.inputs);

export function parseWorkflow(value) {
  const workflow = typeof value === "string" ? JSON.parse(value) : value;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow) || !nodeEntries(workflow).length) {
    throw new Error("需要 ComfyUI API 格式工作流，不能提交画布格式或空对象。");
  }
  return workflow;
}

export function isMossWorkflow(value) {
  try {
    return nodeEntries(parseWorkflow(value)).some(([, node]) =>
      /MOSS/i.test(node.class_type) || node.inputs.type === "moss_image" ||
      ["unet_name", "ckpt_name"].some((key) => /(?:moss|kromoss)/i.test(String(node.inputs[key] || ""))));
  } catch { return false; }
}

export function readMossLayoutPrompt(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("{")) return null;
  let data;
  try { data = JSON.parse(text); }
  catch (error) {
    if (/"summary"\s*:/.test(text) && /"items"\s*:/.test(text)) {
      throw new Error(`MOSS Layout JSON 无法解析：${error.message}`);
    }
    return null;
  }
  return data?.summary && typeof data.summary.caption === "string" && Array.isArray(data.items) ? text : null;
}

export function usesModelPlaceholder(workflow) {
  return JSON.stringify(parseWorkflow(workflow)).includes("%MODEL_NAME%");
}

function combo(info, type, name) {
  const entry = info?.[type]?.input?.required?.[name] ?? info?.[type]?.input?.optional?.[name];
  const values = Array.isArray(entry?.[0]) ? entry[0] : entry?.[1]?.options;
  return Array.isArray(values) ? values.filter((v) => typeof v === "string") : [];
}
const unique = (values) => [...new Set(values)];

export function discoverComfyOptions(info = {}) {
  const modelTypes = ["CheckpointLoaderSimple", "UNETLoader", "MOSSImageUNETLoader", "UnetLoaderGGUF"];
  const models = new Map();
  for (const type of modelTypes) {
    const input = type === "CheckpointLoaderSimple" ? "ckpt_name" : "unet_name";
    for (const value of combo(info, type, input)) {
      if (!models.has(value)) models.set(value, {value, text: type.includes("MOSS") ? `MOSS: ${value}` : value});
    }
  }
  const loraTypes = unique(["LoraLoader", "LoraLoaderModelOnly", "LoraLoaderBypassModelOnly", ...Object.keys(info)]);
  return {
    models: [...models.values()],
    loras: unique(loraTypes.flatMap((type) => combo(info, type, "lora_name"))),
    CLIPs: unique(["CLIPLoader", "MOSSImageCLIPLoader", "DualCLIPLoader"].flatMap((type) => combo(info, type, "clip_name"))
      .concat(combo(info, "CLIPLoaderGGUF", "clip_name").map((name) => `GGUF: ${name}`))),
    vaes: combo(info, "VAELoader", "vae_name"),
    samplers: unique(combo(info, "KSampler", "sampler_name").concat(combo(info, "KSamplerSelect", "sampler_name"))),
    schedulers: unique(combo(info, "KSampler", "scheduler").concat(combo(info, "BasicScheduler", "scheduler"))),
    objectInfo: info,
  };
}

export function preserveMossImport(workflow) {
  const result = clone(parseWorkflow(workflow));
  for (const [, node] of nodeEntries(result)) {
    if (node.class_type === "CLIPTextEncode" && node.inputs.text === "正面") node.inputs.text = "%prompt%";
    if (node.class_type === "CLIPTextEncode" && node.inputs.text === "负面") node.inputs.text = "%negative_prompt%";
  }
  return result;
}

const numeric = new Set(["seed", "steps", "cfg_scale", "width", "height", "c_quanzhong", "c_idquanzhong", "c_xijie", "c_fenwei", "inpaint_denoise"]);
const supported = new Set(["prompt", "negative_prompt", "MODEL_NAME", "sampler_name", "scheduler", "vae", "clip", "ipa", "comfyuicankaotupian", "inpaint_image", "inpaint_mask", "inpaint_positive", "inpaint_negative", ...numeric]);

export function renderComfyWorkflow(payload, template) {
  const workflow = parseWorkflow(template);
  const values = {...payload, inpaint_denoise: payload.inpaint_denoise || 0.75};
  function replacement(name) {
    const value = values[name];
    if (numeric.has(name)) {
      const number = Number(value);
      return Number.isFinite(number) ? number : 0;
    }
    return value == null ? "" : String(value);
  }
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]));
    if (typeof value !== "string") return value;
    const exact = /^%([a-zA-Z_]+)%$/.exec(value);
    if (exact && supported.has(exact[1])) return replacement(exact[1]);
    // Replace once in the original template; never interpret tokens inside an inserted prompt.
    return value.replace(/%([a-zA-Z_]+)%/g, (marker, name) => supported.has(name) ? String(replacement(name)) : marker);
  }
  return visit(workflow);
}

function normalizedName(value) { return String(value).replace(/\\/g, "/").toLowerCase(); }
function resolveLoraName(name, available) {
  name = name.trim().replace(/\\/g, "/");
  const key = normalizedName(name);
  const exact = available.filter((item) => normalizedName(item) === key);
  if (exact.length === 1) return exact[0];
  const wanted = key.replace(/\.(safetensors|pt|ckpt)$/i, "");
  const candidates = available.filter((item) => {
    const candidate = normalizedName(item).replace(/\.(safetensors|pt|ckpt)$/i, "");
    return candidate === wanted || (!wanted.includes("/") && candidate.split("/").pop() === wanted);
  });
  if (candidates.length > 1) throw new Error(`LoRA 文件名有重名，请使用含子目录的完整名称：${name}`);
  if (candidates.length === 1) return candidates[0];
  if (available.length) throw new Error(`ComfyUI LoRA 列表中找不到：${name}。请刷新连接或检查模型目录。`);
  return /\.(safetensors|pt|ckpt)$/i.test(name) ? name : `${name}.safetensors`;
}

export function applyMossLoraTags(template, prompt, available = []) {
  const workflow = clone(parseWorkflow(template));
  if (!isMossWorkflow(workflow) || nodeEntries(workflow).some(([, n]) => /WeiLin/i.test(n.class_type)) || readMossLayoutPrompt(prompt)) {
    return {workflow, prompt, added: []};
  }
  const requests = [];
  const cleaned = String(prompt).replace(/<lora:([^:>]+):([^>]+)>/gi, (tag, name, values) => {
    const strength = Number(values.split(":")[0]);
    if (!values.trim() || !Number.isFinite(strength) || Math.abs(strength) > 100) throw new Error(`LoRA 强度无效：${tag}`);
    requests.push({name: resolveLoraName(name, available), strength});
    return "";
  });
  if (!requests.length) return {workflow, prompt, added: []};
  const fixed = new Set(nodeEntries(workflow).filter(([, n]) => !n._skip && /LoraLoader/i.test(n.class_type))
    .map(([, n]) => normalizedName(n.inputs.lora_name || "")));
  const additions = [];
  for (const request of requests) {
    const key = normalizedName(request.name);
    // A tag must not override an already fixed adapter or load the same adapter twice.
    if (!fixed.has(key)) { additions.push(request); fixed.add(key); }
  }
  if (additions.length) {
    const targets = nodeEntries(workflow).filter(([, n]) => !n._skip && /^(KSampler|KSamplerAdvanced|BasicGuider|CFGGuider|DualCFGGuider|SamplerCustom)$/.test(n.class_type) && Array.isArray(n.inputs.model));
    const sources = unique(targets.map(([, n]) => JSON.stringify(n.inputs.model)));
    if (sources.length !== 1) throw new Error("无法确定 MOSS 的唯一采样模型入口，请在工作流中明确添加 LoRA 节点。");
    const source = JSON.parse(sources[0]);
    const consumers = nodeEntries(workflow).filter(([, n]) => JSON.stringify(n.inputs.model) === sources[0]);
    let nextId = Math.max(0, ...Object.keys(workflow).filter((key) => /^\d+$/.test(key)).map(Number)) + 1;
    let model = source;
    for (const request of additions) {
      while (workflow[String(nextId)]) nextId++;
      const id = String(nextId++);
      workflow[id] = {class_type: "LoraLoaderModelOnly", inputs: {model, lora_name: request.name, strength_model: request.strength}, _meta: {title: `MOSS LoRA: ${request.name}`}};
      model = [id, 0];
    }
    for (const [, node] of consumers) node.inputs.model = model;
  }
  return {workflow, prompt: cleaned.replace(/,\s*,+/g, ",").replace(/^\s*,|,\s*$/g, "").trim(), added: additions};
}

export function describeComfyWorkflow(workflow, fallback = {}) {
  const nodes = nodeEntries(parseWorkflow(workflow)).filter(([, node]) => !node._skip).map(([, node]) => node);
  const find = (types, field) => nodes.find((node) => types.includes(node.class_type) && node.inputs[field] !== undefined)?.inputs[field];
  const result = {...fallback};
  const fields = {
    MODEL_NAME: [["MOSSImageUNETLoader", "UNETLoader", "UnetLoaderGGUF"], "unet_name"],
    steps: [["KSampler", "KSamplerAdvanced", "BasicScheduler", "RapidMOSSAdapter"], "steps"],
    sampler_name: [["KSampler", "KSamplerAdvanced", "KSamplerSelect"], "sampler_name"],
    scheduler: [["KSampler", "KSamplerAdvanced", "BasicScheduler"], "scheduler"],
    cfg_scale: [["KSampler", "KSamplerAdvanced", "CFGGuider"], "cfg"],
    width: [["EmptyFlux2LatentImage", "EmptyLatentImage", "EmptySD3LatentImage"], "width"],
    height: [["EmptyFlux2LatentImage", "EmptyLatentImage", "EmptySD3LatentImage"], "height"],
    seed: [["RandomNoise"], "noise_seed"],
    vae: [["VAELoader"], "vae_name"],
    clip: [["CLIPLoader", "MOSSImageCLIPLoader"], "clip_name"],
  };
  for (const [name, [types, field]] of Object.entries(fields)) {
    const value = find(types, field);
    if (value !== undefined) result[name] = value;
  }
  result.MODEL_NAME = find(["CheckpointLoaderSimple"], "ckpt_name") ?? result.MODEL_NAME;
  result.seed = find(["KSampler", "KSamplerAdvanced"], "seed") ?? result.seed;
  if (nodes.some((node) => node.class_type === "BasicGuider")) result.cfg_scale = 1;
  result.loras = nodes.filter((node) => /LoraLoader/i.test(node.class_type) && typeof node.inputs.lora_name === "string")
    .map((node) => ({name: node.inputs.lora_name, strength: node.inputs.strength_model}));
  return result;
}

export function createMossPreset(info = {}) {
  const discovered = discoverComfyOptions(info);
  const custom = !!info.MOSSImageUNETLoader || !Object.keys(info).length;
  const model = custom ? "moss_image_sft_int8_convrot.safetensors" :
    discovered.models.find((m) => /kromoss_int8_convrot/.test(m.value))?.value || "moss_image_sft_int8_convrot.safetensors";
  const vae = !custom && discovered.vaes.includes("flux2-vae_small.safetensors") ? "flux2-vae_small.safetensors" : "moss_image_vae_bf16.safetensors";
  const finalModel = custom ? ["65", 0] : ["60", 0];
  const graph = {
    "8": {class_type: "VAEDecode", inputs: {samples: ["19", 0], vae: ["15", 0]}},
    "11": {class_type: "CLIPTextEncode", inputs: {text: "%prompt%", clip: ["45", 0]}},
    "15": {class_type: "VAELoader", inputs: {vae_name: vae}},
    "19": {class_type: "SamplerCustomAdvanced", inputs: {noise: ["63", 0], guider: ["62", 0], sampler: ["61", 0], sigmas: ["64", 0], latent_image: ["57", 0]}},
    "45": {class_type: custom ? "MOSSImageCLIPLoader" : "CLIPLoader", inputs: {clip_name: "qwen3.5_9b_moss_image_sft_w4a8_gptq.safetensors", device: "default", ...(!custom ? {type: "moss_image"} : {})}},
    "53": {class_type: custom ? "MOSSImageUNETLoader" : "UNETLoader", inputs: {unet_name: model, weight_dtype: "default"}},
    "57": {class_type: "EmptyFlux2LatentImage", inputs: {width: "%width%", height: "%height%", batch_size: 1}},
    "58": {class_type: "SaveImage", inputs: {filename_prefix: "MOSS-DMD2-Guizhencao", images: ["8", 0]}},
    "59": {class_type: "LoraLoaderModelOnly", inputs: {model: ["53", 0], lora_name: "8-steps-dmd2-lora.safetensors", strength_model: 1}, _meta: {title: "固定 DMD2 加速 / 1.0"}},
    "60": {class_type: "LoraLoaderModelOnly", inputs: {model: ["59", 0], lora_name: "YPuddin-Chenbin-Moss Image-v1.safetensors", strength_model: 0.8}, _meta: {title: "固定鬼针草 MOSS 画风 / 0.8"}},
    "61": {class_type: "KSamplerSelect", inputs: {sampler_name: "euler"}},
    "62": {class_type: "BasicGuider", inputs: {model: finalModel, conditioning: ["11", 0]}},
    "63": {class_type: "RandomNoise", inputs: {noise_seed: "%seed%"}},
    "64": {class_type: "BasicScheduler", inputs: {model: finalModel, scheduler: "simple", steps: 8, denoise: 1}},
  };
  if (custom) graph["65"] = {class_type: "ModelSamplingSD3", inputs: {model: ["60", 0], shift: 5}};
  return graph;
}
