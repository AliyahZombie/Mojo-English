# Mojo - AI-Powered Language Learning 🧠🇺🇸

[English](#english) | [中文](#中文)

---

<a name="english"></a>
## English

Mojo is an intelligent, open-source English learning web application designed to help you master languages efficiently. It combines state-of-the-art Spaced Repetition Systems (SRS) with personalized AI assistance to create a comprehensive and engaging learning experience.

### ✨ Key Features

- **Spaced Repetition (FSRS):** Utilizes the modern `ts-fsrs` algorithm for optimal memorization and review scheduling.
- **Anki Deck Support:** Easily import your existing vocabulary decks (`.apkg` files).
- **AI Chat Assistant:** Built-in AI tutor configured to help you understand words, grammar, and context. Supports multiple model providers:
  - OpenAI Compatible endpoints
  - Google Gemini
  - Anthropic Claude
- **Automated Notifications (via QStash):** Never miss a review! Set up daily CRON schedules connecting to your preferred webhook (e.g., Telegram bots, Discord webhooks) using Upstash QStash, sending push notifications reminding you to study.
- **Local First & Privacy Friendly:** Utilizes browser IndexedDB (`idb`) to locally store your learning progress and dictionary.
- **Polished UI:** A responsive, dark-mode-ready interface built with Tailwind CSS and Motion.

### 🚀 Tech Stack

#### Frontend
- **React 19**
- **Vite**
- **Tailwind CSS v4** (with `clsx` & `tailwind-merge` for utility processing)
- **Motion** for smooth animations
- **Lucide React** for crisp, scalable icons

#### State & Storage
- **Zustand** for lightweight, robust state management
- **IndexedDB** (`idb`) for client-side persistence
- **sql.js** & **jszip** for parsing SQLite databases embedded inside Anki `.apkg` files

#### Algorithms & AI
- **ts-fsrs** for the Free Spaced Repetition Scheduler algorithm
- **Google Gen AI SDK** and native `fetch` support for AI chat streaming

#### Infrastructure & Services
- **Upstash QStash** for serverless CRON notifications (`@upstash/qstash`)

### 🛠️ Setup & Development

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start the Development Server:**
   ```bash
   npm run dev
   ```

3. **Build for Production:**
   ```bash
   npm run build
   ```

### ⚙️ Configuration

#### AI Providers
Head to the **Settings** / **Setup** page in the app to configure your preferred AI provider by entering the base URL, API Key, and selecting the model you wish to use.

#### Push Notifications
To enable automated push notifications (e.g., to Telegram):
1. Get a [QStash Token from Upstash](https://console.upstash.com/qstash).
2. Set up your receiving Webhook URL (e.g., a Telegram Bot webhook).
3. Add your QStash token and Webhook URL in the settings.
4. Save your daily schedule (CRON) and test your delivery!

### 📦 Importing Decks
You can import any `.apkg` Anki file directly from the UI. The application utilizes a web-assembly compiled SQLite (`sql.js`) to extract cards and start scheduling them using the modern FSRS algorithm out of the box.

---

<a name="中文"></a>
## 中文

Mojo 是一款智能开源英语学习 Web 应用，将先进的间隔重复算法与个性化 AI 辅助相结合，帮助你高效掌握语言。

### ✨ 主要功能

- **间隔重复（FSRS）：** 采用现代 `ts-fsrs` 算法，为你制定最优的记忆与复习计划。
- **Anki 牌组支持：** 可直接导入现有的 `.apkg` 词汇牌组。
- **AI 聊天助手：** 内置 AI 教师，帮助你理解单词、语法和语境。支持多个模型提供商：
  - OpenAI 兼容接口
  - Google Gemini
  - Anthropic Claude
- **自动推送提醒（通过 QStash）：** 使用 Upstash QStash 配置每日定时任务，连接你喜欢的 Webhook（如 Telegram Bot、Discord），到时间自动发送复习提醒。
- **本地优先，保护隐私：** 使用浏览器 IndexedDB（`idb`）在本地存储学习进度和词典数据。
- **精致 UI：** 基于 Tailwind CSS 和 Motion 构建，支持深色模式，界面响应流畅。

### 🚀 技术栈

#### 前端
- **React 19**
- **Vite**
- **Tailwind CSS v4**（搭配 `clsx` 和 `tailwind-merge`）
- **Motion** 动画库
- **Lucide React** 图标库

#### 状态与存储
- **Zustand** 状态管理
- **IndexedDB**（`idb`）客户端持久化
- **sql.js** 和 **jszip** 解析 Anki `.apkg` 文件中的 SQLite 数据库

#### 算法与 AI
- **ts-fsrs** 自由间隔重复调度算法
- **Google Gen AI SDK** 及原生 `fetch` 支持流式 AI 对话

#### 基础设施
- **Upstash QStash** 无服务器定时通知

### 🛠️ 安装与开发

1. **安装依赖：**
   ```bash
   npm install
   ```

2. **启动开发服务器：**
   ```bash
   npm run dev
   ```

3. **生产构建：**
   ```bash
   npm run build
   ```

### ⚙️ 配置

#### AI 提供商
在应用的**设置**页面中，填写 Base URL、API Key 并选择模型即可切换 AI 提供商。

#### 推送通知
若要启用自动推送提醒（如推送到 Telegram）：
1. 在 [Upstash 控制台](https://console.upstash.com/qstash) 获取 QStash Token。
2. 准备好接收 Webhook 的 URL（如 Telegram Bot Webhook）。
3. 在设置页面填入 QStash Token 和 Webhook URL。
4. 配置每日定时（CRON）并测试是否正常推送。

### 📦 导入牌组
在应用界面直接导入任意 `.apkg` Anki 文件即可。应用使用 WebAssembly 编译的 SQLite（`sql.js`）解析卡片，并立即用 FSRS 算法开始调度复习。

---

*用 Mojo 保持你的学习连击！*
