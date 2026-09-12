# 更新日志

## 0.1.11
- 修复在 dsh ≥ 0.1.5（如 0.1.5-rc.2）上完全失效：新版输入框由 `<textarea>` 改为 Lexical contenteditable 编辑器，旧粘贴处理器首行的 `instanceof HTMLTextAreaElement` 判定永远不成立，导致长文本粘贴被静默忽略（无任何报错）。现同时兼容两种输入框形态。
- 光标位置改走新版 shell：`conversation.input.for(actx).caretSpan()` 取选区、`shell.rev` 作修订号 CAS，取代 textarea 的 `selectionStart/End`；插入被拒时兜底改为 `shell.paste(text)`（更旧版本仍回退 `setDraft`）。
- 冒烟测试补充新版 contenteditable 场景的回归用例（旧代码跑该用例会失败）。

## 0.1.10
- 支持 `dsh plugin --profile web add` 标准安装：package.json 增加 `dsh.bundle.patch` 声明并随包发布 `cordis.patch.yml`，安装后自动加入 profile 的 bundle 层，无需再手工编辑 profile 的 `cordis.patch.yml`。

## 0.1.9
- 修复与 plan/命令模式联动时粘贴数据丢失：命令 claim 生效（`claimed` 阶段）时改为放行纯文本粘贴，避免引用芯片占位符导致进入命令 args 的全文被截断；普通模式芯片功能保持不变。

## 0.1.8
- 引用芯片边框改为中性主题色（`--dsw-alias-border-l3`），不再使用蓝色。

## 0.1.7
- 在透明底基础上增加细边框胶囊，让引用芯片更醒目。

## 0.1.6
- 引用芯片改为透明底色极简风格（无背景/阴影，仅显示 📄 + 文本预览）。

## 0.1.5
- 修复发送报错 `slash: no serializer for reference source ...`：`ReferenceInsert.source` 与 source 注册的 `name` 不一致导致序列化查找失败，现已统一。

## 0.1.4
- 修复粘贴长文本后界面卡死：移除对 `title` 属性的观察与写回（与 React 形成反馈循环），MutationObserver 降级为仅观察 childList + 幂等的 data 属性写入；粘贴处理器整体加 try/catch 兜底。

## 0.1.3
- 引用芯片标签改为显示文本前几个字的预览；新增芯片样式标记器（后因性能/循环问题在 0.1.4 重构）。

## 0.1.2
- 文档卡片与输入框中的存活引用同步：删除引用芯片后对应卡片立即消失，发送后自动清空。

## 0.1.1
- 修复宿主侧入口：补全 cordis 插件导出（空 `apply`），解决安装后 `dsh web` 重启失败（loader 需要宿主 fiber 正常激活）。

## 0.1.0
- 首个可用版本：粘贴长文本自动生成引用芯片 + 可折叠文档卡片，发送时以 `<引用文档>` 结构化文本携带全文。
