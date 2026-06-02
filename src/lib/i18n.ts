export const translations = {
  en: {
    // Layout
    goodMorning: 'Good morning',
    goodAfternoon: 'Good afternoon',
    goodEvening: 'Good evening',
    lateNight: "You're up late",
    learner: 'Learner',
    dashboard: 'Dashboard',
    setup: 'Setup',
    dictionary: 'Dictionary',
    themeLight: 'Switch to light theme',
    themeDark: 'Switch to dark theme',
    
    // Home
    yourProgress: 'Your Progress',
    dailyWords: 'Daily Words',
    goal: 'Goal',
    wordsPerDay: 'words/day',
    streak: 'Streak',
    days: 'days',
    best: 'Best',
    studyTime: 'Study Time',
    today: 'Today',
    wordsRead: 'Words Read',
    weeklyWordsStudied: 'Weekly Words Studied',
    words: 'Words',
    news: 'News',
    writing: 'Writing',
    goLearning: 'Go learning',
    readNews: 'Read News',
    extractAndLearn: 'Extract & learn',
    practiceOutput: 'Practice output',
    
    // Decks
    decksManagement: 'Decks Management',
    decksManagementDesc: 'Import vocabulary from Anki (.apkg) files.',
    uploadApkg: 'Upload .apkg File',
    uploading: 'Uploading & Parsing...',
    activeDeck: 'Active Deck',
    noDecks: 'No decks available. Upload one to start learning!',
    wordsCount: 'words',
    deleteDeck: 'Delete',
    
    // Quotes
    quotes: [
      "Keep up the momentum!",
      "Consistency is the key to mastery.",
      "Every word you learn opens a new door.",
      "Small daily improvements lead to massive results.",
      "Your future self will thank you for today's effort.",
      "A little progress each day adds up to big results.",
      "The secret of getting ahead is getting started.",
      "Learning is a treasure that will follow its owner everywhere."
    ]
  },
  zh: {
    // Layout
    goodMorning: '早上好',
    goodAfternoon: '下午好',
    goodEvening: '晚上好',
    lateNight: '夜深了',
    learner: '学习者',
    dashboard: '仪表盘',
    setup: '设置',
    dictionary: '词典',
    themeLight: '切换至浅色模式',
    themeDark: '切换至深色模式',
    
    // Home
    yourProgress: '你的进度',
    dailyWords: '每日单词',
    goal: '目标',
    wordsPerDay: '词/天',
    streak: '连续打卡',
    days: '天',
    best: '最高',
    studyTime: '学习时长',
    today: '今天',
    wordsRead: '阅读字数',
    weeklyWordsStudied: '本周单词学习',
    words: '单词',
    news: '新闻',
    writing: '写作',
    goLearning: '去学习',
    readNews: '阅读新闻',
    extractAndLearn: '提取并学习',
    practiceOutput: '输出练习',
    
    // Decks
    decksManagement: '词书管理',
    decksManagementDesc: '从 Anki 的 .apkg 文件导入词汇。',
    uploadApkg: '上传 .apkg 文件',
    uploading: '上传并解析中...',
    activeDeck: '当前使用词书',
    noDecks: '暂无词书。请上传词书以开始学习！',
    wordsCount: '个词',
    deleteDeck: '删除',
    
    // Quotes
    quotes: [
      "保持势头！",
      "持之以恒是精通的关键。",
      "你学到的每一个单词都会打开一扇新门。",
      "每天微小的进步带来巨大的结果。",
      "未来的你会感谢今天的努力。",
      "每天进步一点点，积累起来就是大成就。",
      "成功的秘诀在于开始。",
      "学习是一生相随的财富。"
    ]
  }
};

export type Language = 'en' | 'zh';
export type TranslationKey = keyof typeof translations.en;
