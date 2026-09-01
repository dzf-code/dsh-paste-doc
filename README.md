# dsh-paste-doc

> DSH（DeepSeek Harness）客户端插件：粘贴长文本时自动生成「文本文档引用」，效果类似 DeepSeek 官方聊天的文档折叠。
>
> `Paste long text into the DSH composer → it becomes a collapsible document citation (chip + expandable card). Full text is sent to the model as a structured reference.`

## 特性

- ✂️ 在输入框粘贴 **≥ 200 字**的文本，自动转换为引用芯片：显示 `📄` + 文本前几个字的预览
- 📑 输入框上方出现可「展开 / 收起」的文档卡片，随时查看全文
- 📤 发送时把每个引用序列化为结构化文本，随消息一起交给模型：

  ```xml
  <引用文档 id="doc1" 标题="…" 字数="1234">
  <全文>
  ……原文……
  </全文>
  </引用文档>
  ```

- 🔗 输入 `@doc1` 高亮为文本引用；`@` 菜单可手动插入历史粘贴文档
- 🎨 极简样式：透明底色 + 中性描边胶囊（跟随主题，无阴影、无突兀配色）
- 🔄 卡片与芯片实时同步：删除芯片 → 卡片立即消失；发送后 → 全部清空
- 🛟 逃生通道：`Ctrl+Shift+V`（Windows/Linux）或 `Cmd+Shift+V`（macOS）粘贴纯文本；粘贴图片/短文本不受影响

## 安装（在 DSH 中启用）

### 前置

- DSH `web` profile（`~/.dsh/profiles/web`）
- pnpm

### 方式一：`dsh plugin add` 一键安装（推荐，v0.1.10+）

插件声明了 `dsh.bundle.patch` 并随包携带 `cordis.patch.yml`，安装后自动加入 profile 的 bundle 层，**无需再手工编辑任何配置文件**。任选一种来源：

**从 npm 安装**（⚠️ 尚未发布到 npm，此命令暂不可用；发布后即可使用，届时会第一时间更新说明）：

```bash
dsh plugin --profile web add dsh-paste-doc
```

**从本地打包文件安装**（先用 `pnpm pack` 生成 `dsh-paste-doc-<version>.tgz`）：

```bash
dsh plugin --profile web add "file:/绝对路径/dsh-paste-doc-<version>.tgz"
```

**本地开发直链安装**（源码改动即时生效，无需反复打包，推荐开发时使用）：

```bash
dsh plugin --profile web add "link:/绝对路径/dsh-paste-doc"
```

**从 GitHub 直接安装**（无需 npm、无需本地打包）：

```bash
dsh plugin --profile web add "github:dzf-code/dsh-paste-doc"
```

安装完成后**重启 `dsh web`**，进入设置 → 插件列表确认 `paste-doc` 状态为 active。

### 方式二：手动安装（备选 / 兼容旧版）

1. **打包插件**（或直接使用 release 中的 `dsh-paste-doc-<version>.tgz`）：

   ```bash
   cd dsh-paste-doc
   pnpm pack
   ```

2. **安装到 web profile**：

   ```bash
   cd ~/.dsh/profiles/web
   pnpm add "file:/绝对路径/dsh-paste-doc-<version>.tgz"
   ```

3. **在 `cordis.patch.yml` 中启用插件**（追加到末尾）：

   ```yaml
   - insert:
       - id: paste-doc
         name: dsh-paste-doc
   ```

4. **重启 `dsh web`**，进入设置 → 插件列表确认 `paste-doc` 状态为 active。

## 使用

- **粘贴长文本**：直接 `Ctrl+V` 即可，自动变成引用芯片 + 文档卡片
- **想粘贴纯文本**（不转引用）：`Ctrl+Shift+V` / `Cmd+Shift+V`
- **查看全文**：点击输入框上方的卡片「展开」
- **删除引用**：在输入框里删掉芯片（退格 / 选中删除），卡片会同步消失
- **手动插入历史文档**：输入 `@` 在菜单中选择「粘贴文档」来源
- **命令 / plan 模式**：当 `/plan`、`/goal` 等命令 claim 正在生效时，粘贴长文本会以纯文本插入（而不是芯片），确保完整内容进入命令参数、不被截断

## 工作原理

插件是一个标准的 DSH 客户端插件（`dsh.client` 双面包）：

```text
浏览器端 (lib/client.js, lazy-CJS factory bundle)
├─ 粘贴拦截：document capture 阶段监听 paste，命中输入卡 + 长文本时
│    阻止默认粘贴，把文本存入内存文档库，并通过 slash/input-insert-reference
│    事件插入一个引用芯片（复用 DSH 原生芯片渲染管线）
├─ 文档卡片：注册到 conversation.input.dock 插槽，列表由输入框中的
│    存活引用（occurrences）实时派生 —— 芯片删卡片就消失
├─ @ 来源：注册 inputTriggers 来源，支持 @ 菜单插入与 @docN 文本引用高亮
└─ 序列化：codec.serialize 在发送时把引用展开为 <引用文档> 结构化文本

宿主侧 (lib/index.js)
└─ 空 apply：让 loader 的宿主 fiber 正常激活（客户端插件约定）
```

> 文档库保存在浏览器内存中（刷新页面即清空）；引用芯片的样式通过 childList MutationObserver 打 `data-paste-doc-chip` 标记后由 CSS 定制，仅影响本插件的芯片。

## 开发

### 目录结构

```text
dsh-paste-doc/
├── lib/
│   ├── index.js      # 宿主侧入口（空 apply，插件激活约定）
│   └── client.js     # 浏览器端 bundle（核心逻辑，lazy-CJS factory 格式）
├── test/
│   └── smoke.mjs     # 冒烟测试（mock 浏览器环境，Node 直接运行）
├── cordis.patch.yml  # bundle 挂载声明（`dsh plugin add` 安装时自动应用）
├── package.json
├── README.md
├── CHANGELOG.md
└── LICENSE
```

### 测试

```bash
node test/smoke.mjs
# 覆盖：长文本拦截、引用插入事件、序列化、词典、候选、
#       Ctrl+Shift+V 逃生、只读输入框放行、卡片与芯片同步、source/name 一致性
```

### 修改后同步到本机安装

`file:` 依赖按版本缓存，直接改源码不会自动同步。两种方式任选：

1. 升版本后重新打包安装：

   ```bash
   # 修改 package.json 的 version 后
   pnpm pack && cd ~/.dsh/profiles/web && pnpm add "file:/绝对路径/新版本.tgz"
   ```

2. 直接覆盖安装副本：

   ```bash
   cp lib/* ~/.dsh/profiles/web/node_modules/dsh-paste-doc/lib/
   ```

然后重启 `dsh web` 生效。

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 安装后重启失败 | 宿主侧入口必须是合法 cordis 插件（空 `apply`）——0.1.1 已修复 |
| 粘贴长文本后卡死 | 0.1.4 修复：移除 title 属性写回循环，观察器只保留 childList |
| 发送报错 `slash: no serializer...` | 0.1.5 修复：插入 source 与 source 注册名不一致 |
| 想粘贴纯文本 | `Ctrl+Shift+V` / `Cmd+Shift+V` |

## 发布到 Git

```bash
cd dsh-paste-doc
git init
git add .
git commit -m "feat: paste long text as collapsible document citation"

# 在 GitHub / Gitee 上新建空仓库后：
git remote add origin https://github.com/dzf-code/dsh-paste-doc.git
git branch -M main
git push -u origin main
```

> 提示：`*.tgz` 已被 `.gitignore` 排除，仓库只保留源码；发布前记得把 `package.json` 里的 `repository.url` 改成你的仓库地址。

## License

[MIT](LICENSE)
