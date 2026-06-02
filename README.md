# Mojo - AI-Powered Language Learning 🧠🇺🇸

Mojo is an intelligent, open-source English learning web application designed to help you master languages efficiently. It combines state-of-the-art Spaced Repetition Systems (SRS) with personalized AI assistance to create a comprehensive and engaging learning experience.

## ✨ Key Features

- **Spaced Repetition (FSRS):** Utilizes the modern `ts-fsrs` algorithm for optimal memorization and review scheduling.
- **Anki Deck Support:** Easily import your existing vocabulary decks (`.apkg` files).
- **AI Chat Assistant:** Built-in AI tutor configured to help you understand words, grammar, and context. Supports multiple model providers:
  - OpenAI Compatible endpoints
  - Google Gemini
  - Anthropic Claude
- **Automated Notifications (via QStash):** Never miss a review! Set up daily CRON schedules connecting to your preferred webhook (e.g., Telegram bots, Discord webhooks) using Upstash QStash, sending push notifications reminding you to study.
- **Local First & Privacy Friendly:** Utilizes browser IndexedDB (`idb`) to locally store your learning progress and dictionary.
- **Polished UI:** A responsive, dark-mode-ready interface built with Tailwind CSS and Framer Motion.

## 🚀 Tech Stack

### Frontend
- **React 19**
- **Vite**
- **Tailwind CSS v4** (with `clsx` & `tailwind-merge` for utility processing)
- **Framer Motion** for smooth animations
- **Lucide React** for crisp, scalable icons

### State & Storage
- **Zustand** for lightweight, robust state management
- **IndexedDB** (`idb`) for client-side persistence
- **sql.js** & **jszip** for parsing SQLite databases embedded inside Anki `.apkg` files

### Algorithms & AI
- **ts-fsrs** for the Free Spaced Repetition Scheduler algorithm
- **Google Gen AI SDK** and native `fetch` support for AI chat streaming

### Infrastructure & Services
- **Upstash QStash** for serverless CRON notifications (`@upstash/qstash`)

## 🛠️ Setup & Development

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

## ⚙️ Configuration

### AI Providers
Head to the **Settings** / **Setup** page in the app to configure your preferred AI provider by entering the base URL, API Key, and selecting the model you wish to use.

### Push Notifications
To enable automated push notifications (e.g., to Telegram):
1. Get a [QStash Token from Upstash](https://console.upstash.com/qstash).
2. Set up your receiving Webhook URL (e.g., a Telegram Bot webhook).
3. Add your QStash token and Webhook URL in the settings.
4. Save your daily schedule (CRON) and test your delivery!

## 📦 Importing Decks
You can import any `.apkg` Anki file directly from the UI. The application utilizes a web-assembly compiled SQLite (`sql.js`) to extract cards and start scheduling them using the modern FSRS algorithm out of the box.

---

*Keep your streak alive with Mojo!*
