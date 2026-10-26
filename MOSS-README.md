# 智绘姬 MOSS 兼容版

本自用修改版基于智绘姬 `st-chatu8` 3.1.6。

- 原作者：从前跟你一样（damoshen123）。
- 上游：[damoshen2/st-chatu8](https://gitee.com/damoshen2/st-chatu8)，基准提交 `171425dc77db817ad284adb9a4a46d34ee2f894c`。
- 修改者：Codex；修改日期：2026-10-26。
- 整体沿用 Aladdin Free Public License v9。完整许可证在同目录 `LICENSE`，可用文本编辑器打开、打印。保留原作者版权；本修改版免费提供、不提供担保。

## 安装

在酒馆的扩展菜单选择“安装扩展”，粘贴以下 GitHub 地址：

```text
https://github.com/uiwcvb/st-chatu8
```

1. 已安装原版时，先导出智绘姬配置并备份原 `st-chatu8` 目录；把备份放到扩展目录以外，避免同时加载两个副本。
2. 用上面的仓库替换原版。安装后的目录名继续使用 `st-chatu8`，本版保留原插件的设置命名空间。首次安装可直接使用仓库地址。
3. 刷新酒馆页面（Ctrl+F5），进入智绘姬的 ComfyUI 页，保持原来能连通的地址，点击“测试连接”，再点击“载入 MOSS：DMD2八步＋鬼针草”。

仓库包含完整插件、源码、许可证、回归脚本及 API 工作流，无需 npm 安装或编译。原版介绍保留在 [UPSTREAM-README.md](UPSTREAM-README.md)。不要向此修改版执行原上游的强制更新，以免覆盖兼容修改。

## 固定工作流

新按钮会另存预设并选中它，保留原有预设，不自动出图。默认配置：

| 项目 | 值 |
| --- | --- |
| 加速 LoRA | `8-steps-dmd2-lora.safetensors`，强度 1.0 |
| 画风 LoRA | `YPuddin-Chenbin-Moss Image-v1.safetensors`，强度 0.8 |
| 采样 | Euler / simple，8 步，BasicGuider（相当于 CFG 1） |
| 提示词、宽高、种子 | 继续使用你原先的占位符和输入 |

按钮按连接缓存选择 MOSS 自定义加载器或 ComfyUI 原生加载器。自定义加载器使用你提供的 SFT 模型和 MOSS VAE，并设置 Shift 5；原生加载器优先使用可用的 Kromoss INT8 和 FLUX.2 Small VAE，保留其原生采样实现。所有模型仍需存在于**实际连接的 ComfyUI**模型目录中，插件不会下载模型。

两份 LoRA 需要放在实际连接的 ComfyUI 的 `models/loras/` 中；如果模型存放在子目录，工作流里的文件名也必须包含对应子目录。此仓库不包含模型或 LoRA 权重。

鬼针草的作者激活词是 `@ypuddinneko`，由你自己添加。普通提示词直接填写；MOSS Layout 中放在 `summary.caption` 内，不要拼在 JSON 外，也不要放进可见文字的 `text` 字段。DMD2 不需要额外激活词。

## 修复内容

- 连接读取不再假定后端必有 `CheckpointLoaderSimple`、`CLIPLoader`、`LoraLoader` 和 `KSampler`；支持 MOSS 加载器、ModelOnly LoRA、KSamplerSelect、BasicScheduler，并保留 LoRA 子目录名称。
- MOSS 的“简易修改”保留写死的模型、LoRA、强度、步数、采样器、CFG、尺寸和种子；仅转换明确的“正面/负面”标记。已有占位符继续生效。
- 工作流没有 `%MODEL_NAME%` 时，不再强制要求面板选择模型。
- 原生 MOSS 普通提示词中的 `<lora:文件名:强度>` 会变成真正的 `LoraLoaderModelOnly` 节点，不依赖 WeiLin。已有固定 LoRA 不重复加载，也不会被同名标签改掉强度；要改固定强度请编辑工作流节点。
- MOSS Layout 整段 JSON 不经过旧标签去重、中文注释清理、角色替换、尺寸文本清理、固定前后缀或质量词拼接。中文对白、引号、逗号、换行和原有坐标保留。普通提示词仍保留你已有的前后置预设设置。
- 占位符按 JSON 值替换，插入的提示词不会再被当成新模板展开。
- 生成参数报告读取实际提交的工作流，记录真实模型、步数、采样器、CFG、尺寸和 LoRA，避免报告仍显示面板中的旧值。
- 预处理或 Layout 出错时会释放任务锁，避免后续请求一直等待。

浏览器直连模式可以从 `/object_info` 获取完整的新节点与 LoRA 列表。酒馆代理模式的列表仍受宿主提供的接口字段限制；固定 API 工作流提交和 Layout 保真已覆盖两种传输路径的模拟回归。

## 验证范围

14 项回归通过，覆盖现代节点枚举、固定值保护、LoRA 接线、中文 Layout 保真、真实插件提交函数的浏览器/酒馆代理两条路径、预设按钮、参数报告和错误时释放任务锁。

可在本目录执行：

```text
node --test tests/moss-compat.test.mjs
```

这些检查使用模拟的 ComfyUI 接口，没有启动 GPU、产生新图片或改动你的驱动。它们不等于已经在你实际安装的酒馆完成真实出图验收。
