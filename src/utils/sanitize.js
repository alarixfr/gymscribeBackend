export const sanitize = (str, maxLength = 100) => {
  if (!str || str === 'none') return 'none';
  return String(str).trim().slice(0, maxLength);
};

export const sanitizeJournal = (journal) => {
  return {
    id: String(journal.id || '').slice(0, 100),
    title: String(journal.title || '').trim().slice(0, 100),
    desc: String(journal.desc || '').trim().slice(0, 100),
    timestamp: journal.timestamp || Date.now()
  };
};