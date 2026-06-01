const fs = require('fs/promises');
const path = require('path');

const chatLogPath = path.join(__dirname, '../ai-module/pipeline/listenlist/chat.jsonl');

function isQuestionMessage(message) {
  const text = String(message || '').trim();
  if (!text) return false;

  return (
    text.includes('?') ||
    text.includes('？') ||
    /(질문|궁금|어떻게|왜|뭐|무엇|언제|어디|누구|가능한가|될까요|인가요|나요|까요|해요|해도 돼|알려주세요)/.test(text)
  );
}

async function appendChat({ broadcastId, userId, username, message, createdAt }) {
  const text = String(message || '').trim();
  if (!text) return;

  await fs.mkdir(path.dirname(chatLogPath), { recursive: true });

  const entry = {
    time: createdAt instanceof Date ? createdAt.toISOString() : new Date().toISOString(),
    broadcast_id: String(broadcastId || ''),
    user_id: String(userId || ''),
    username: username || 'unknown',
    message: text,
    is_question: isQuestionMessage(text),
    used: false,
  };

  await fs.appendFile(chatLogPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

module.exports = {
  appendChat,
  chatLogPath,
};
