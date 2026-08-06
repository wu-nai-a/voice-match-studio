const state = {
  voices: [],
  roles: [],
  selectedRoleId: null,
  filters: { gender: 'all', maturity: 'mature', search: '' },
  sourceWorkbook: null,
  objectUrls: [],
  customDraftFiles: [],
  matchConfig: { maturity: 'mature', strategy: 'best' },
  pendingRoleImport: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  voiceFolderInput: $('#voiceFolderInput'), roleFileInput: $('#roleFileInput'),
  voiceImportStatus: $('#voiceImportStatus'), roleImportStatus: $('#roleImportStatus'),
  femaleCount: $('#femaleCount'), maleCount: $('#maleCount'), femaleYoungCount: $('#femaleYoungCount'), maleYoungCount: $('#maleYoungCount'),
  roleCount: $('#roleCount'), roleList: $('#roleList'), roleQueueTitle: $('#roleQueueTitle'),
  roleDetailPanel: $('#roleDetailPanel'), voiceGrid: $('#voiceGrid'), voiceSearch: $('#voiceSearch'),
  exportButton: $('#exportButton'), exportTitle: $('#exportTitle'), exportMeta: $('#exportMeta'),
  exportPreview: $('#exportPreview'), exportStatus: $('#exportStatus'), toast: $('#toast'),
  customVoiceInput: $('#customVoiceInput'), customVoiceStatus: $('#customVoiceStatus'),
  customVoiceDialog: $('#customVoiceDialog'), customVoiceRows: $('#customVoiceRows'), customVoiceForm: $('#customVoiceForm'),
  matchConfigDialog: $('#matchConfigDialog'), matchConfigForm: $('#matchConfigForm'),
  matchMaturitySelect: $('#matchMaturitySelect'), matchStrategySelect: $('#matchStrategySelect'),
  topMatchToolbar: $('#topMatchToolbar'),
};

function icon(name) { return `<i data-lucide="${name}"></i>`; }
function refreshIcons() { window.lucide?.createIcons(); }
function displayFile(file) { return file?.name || '未绑定音频文件'; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function baseName(fileName) { return String(fileName || '').replace(/\.[^.]+$/, '').trim() || '未命名音色'; }
function voiceIdSlug(value) {
  const slug = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'voice';
}
function uniqueCustomId(seed, usedIds, index) {
  const base = `custom_${voiceIdSlug(seed)}_${Date.now().toString(36)}_${index + 1}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}_${suffix++}`;
  return id;
}
function inferCustomMetadata(fileName) {
  const text = baseName(fileName).toLowerCase();
  const female = ['女', '女性', '女生', '少女', '姐姐', '御姐', '妹', 'nvsheng', 'shao_nv', 'yu_jie', 'shu_nv', 'female'].some((word) => text.includes(word));
  const male = ['男', '男性', '男生', '少年', '弟弟', '熟男', 'nansheng', 'shao_nian', 'shu_nan', 'di_di', 'male'].some((word) => text.includes(word));
  const young = ['幼', '萝莉', '少女', '少年', '奶萌', '软萌', '可爱', 'young', 'shao_nv', 'shao_nian'].some((word) => text.includes(word));
  const mature = ['成熟', '熟女', '御姐', '熟男', '低沉', '稳重', 'mature', 'wen_rou', 'yu_jie', 'shu_nv', 'shu_nan', 'di_chen', 'qing_leng', 'ci_xing', 'gao_leng'].some((word) => text.includes(word));
  return { gender: female && !male ? 'female' : male && !female ? 'male' : 'unknown', maturity: young && !mature ? 'young' : mature && !young ? 'mature' : 'unknown' };
}
function knownVoiceForFile(fileName) {
  const name = String(fileName || '').toLowerCase();
  return state.voices.find((voice) => String(voice.audioFile || '').toLowerCase() === name) || null;
}
function customDefaults(file) {
  const known = knownVoiceForFile(file.name);
  const inferred = inferCustomMetadata(`${file.name} ${known?.voiceName || ''}`);
  return {
    name: known?.voiceName || baseName(file.name),
    seed: known?.voiceId || baseName(file.name),
    gender: known?.gender || inferred.gender,
    maturity: known?.maturity || inferred.maturity,
  };
}
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function setImportStatus(element, message, ready = false) {
  element.classList.toggle('ready', ready);
  element.innerHTML = `<span class="status-dot"><span></span>${message}</span>`;
}

function voiceLabel(voice) { return voice.voiceName || voice.voiceId; }
function maturityText(voice) { return voice.maturity === 'mature' ? '偏成熟' : '偏幼态/年轻'; }
function genderText(voice) { return voice.gender === 'female' ? '女声' : voice.gender === 'male' ? '男声' : '待确认'; }

function normalizeVoice(raw, audioUrl) {
  return {
    voiceId: raw.voiceId,
    voiceName: raw.voiceName || raw.voiceId,
    gender: raw.gender === 'male' ? 'male' : 'female',
    maturity: raw.maturity === 'mature' ? 'mature' : 'young',
    audioFile: raw.audioFile || raw.file || '',
    sourceVoiceId: raw.sourceVoiceId || raw.voiceId,
    mappingStatus: raw.mappingStatus || 'latest-json',
    custom: Boolean(raw.custom),
    origin: raw.origin || 'package',
    audioUrl: audioUrl || '',
    profile: raw.profile || { authority: .5, warmth: .5, intimacy: .5, energy: .5, restraint: .5, brightness: .5 },
    description: raw.description || '',
  };
}

function replaceVoices(voices, sourceLabel) {
  const customVoices = state.voices.filter((voice) => voice.custom);
  const packageIds = new Set(voices.map((voice) => voice.voiceId));
  const preservedCustom = customVoices.filter((voice) => !packageIds.has(voice.voiceId));
  const keepUrls = new Set(preservedCustom.map((voice) => voice.audioUrl).filter(Boolean));
  state.objectUrls.filter((url) => !keepUrls.has(url)).forEach((url) => URL.revokeObjectURL(url));
  state.objectUrls = [...keepUrls];
  state.voices = [...voices, ...preservedCustom];
  setImportStatus(els.voiceImportStatus, `${sourceLabel} · ${state.voices.length} 条音色`, true);
  renderAll();
}

async function loadDemoManifest() {
  try {
    const response = await fetch('assets/voice-package/manifest.json');
    if (!response.ok) return;
    const manifest = await response.json();
    const voices = manifest.voices.map((voice) => normalizeVoice(voice, `assets/voice-package/${voice.audioPath}`));
    replaceVoices(voices, '已加载示例资源包');
  } catch {
    // The app remains usable with a user-imported resource package.
  }
}

async function importVoiceFolder(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  const manifestFile = files.find((file) => file.name === 'manifest.json');
  if (!manifestFile) {
    showToast('资源包中未找到 manifest.json');
    return;
  }
  try {
    const manifest = JSON.parse(await manifestFile.text());
    const byPath = new Map();
    files.forEach((file) => {
      const relative = file.webkitRelativePath || file.name;
      byPath.set(relative.replace(/^.*?\/(.*)$/, '$1'), file);
      byPath.set(relative, file);
      byPath.set(file.name, file);
    });
    const voices = manifest.voices.map((voice) => {
      const file = byPath.get(voice.audioPath) || byPath.get(voice.audioFile);
      const audioUrl = file ? URL.createObjectURL(file) : '';
      return normalizeVoice(voice, audioUrl);
    });
    const missing = voices.filter((voice) => !voice.audioUrl).length;
    replaceVoices(voices, missing ? `已导入，${missing} 条缺少音频文件` : '资源包导入完成');
    showToast(missing ? `已导入 ${voices.length} 条，${missing} 条未找到音频` : `已导入 ${voices.length} 条音色资源`);
  } catch (error) {
    console.error(error);
    showToast('资源包读取失败，请检查 manifest.json 格式');
  }
}

function defaultCustomProfile(gender, maturity, text) {
  const profile = { authority: .45, warmth: gender === 'female' ? .62 : .48, intimacy: .52, energy: maturity === 'young' ? .72 : .42, restraint: maturity === 'young' ? .3 : .62, brightness: maturity === 'young' ? .75 : .4 };
  const lower = text.toLowerCase();
  if (/冷|低沉|烟嗓|克制|高冷/.test(lower)) { profile.brightness -= .15; profile.restraint += .15; }
  if (/温柔|治愈|贴心|暖/.test(lower)) { profile.warmth += .16; profile.intimacy += .08; }
  if (/妩媚|魅惑|磁性|病娇|妖娆/.test(lower)) { profile.intimacy += .2; }
  if (/阳光|元气|活力|灵动/.test(lower)) { profile.energy += .18; profile.brightness += .1; }
  return Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, Math.max(.05, Math.min(.95, Number(value.toFixed(2))))]));
}

function openCustomVoiceDialog(files) {
  state.customDraftFiles = files;
  const usedIds = new Set(state.voices.map((voice) => voice.voiceId));
  els.customVoiceRows.innerHTML = files.map((file, index) => {
    const defaults = customDefaults(file);
    const id = uniqueCustomId(defaults.seed, usedIds, index);
    usedIds.add(id);
    return `<div class="custom-voice-row" data-custom-row="${index}">
      <div class="custom-file-name"><i data-lucide="music-2"></i><strong>${escapeHtml(file.name)}</strong><small>${Math.ceil(file.size / 1024)} KB · 自动推断可修改</small></div>
      <label>名称（建议中文）<input data-custom-name value="${escapeHtml(defaults.name)}" required /></label>
      <label>voiceId<input data-custom-id value="${escapeHtml(id)}" pattern="[A-Za-z0-9_-]+" required /></label>
      <label>性别<select data-custom-gender><option value="unknown" ${defaults.gender === 'unknown' ? 'selected' : ''}>待确认</option><option value="female" ${defaults.gender === 'female' ? 'selected' : ''}>女</option><option value="male" ${defaults.gender === 'male' ? 'selected' : ''}>男</option></select></label>
      <label>成熟度<select data-custom-maturity><option value="unknown" ${defaults.maturity === 'unknown' ? 'selected' : ''}>待确认</option><option value="mature" ${defaults.maturity === 'mature' ? 'selected' : ''}>偏成熟</option><option value="young" ${defaults.maturity === 'young' ? 'selected' : ''}>偏幼态/年轻</option></select></label>
    </div>`;
  }).join('');
  refreshIcons();
  if (typeof els.customVoiceDialog.showModal === 'function') els.customVoiceDialog.showModal();
  else els.customVoiceDialog.setAttribute('open', '');
}

function closeCustomVoiceDialog() {
  state.customDraftFiles = [];
  if (els.customVoiceDialog.open) els.customVoiceDialog.close();
  else els.customVoiceDialog.removeAttribute('open');
}

function addCustomVoices(event) {
  event.preventDefault();
  if (event.submitter?.value !== 'default') return closeCustomVoiceDialog();
  const rows = $$('#customVoiceRows [data-custom-row]');
  const entries = rows.map((row, index) => ({
    file: state.customDraftFiles[index],
    voiceName: row.querySelector('[data-custom-name]').value.trim(),
    voiceId: row.querySelector('[data-custom-id]').value.trim(),
    gender: row.querySelector('[data-custom-gender]').value,
    maturity: row.querySelector('[data-custom-maturity]').value,
  }));
  const ids = new Set(state.voices.map((voice) => voice.voiceId));
  if (entries.some((entry) => !entry.voiceName || !/^[A-Za-z0-9_-]+$/.test(entry.voiceId) || entry.gender === 'unknown' || entry.maturity === 'unknown')) return showToast('请为每条自定义音色补齐名称、英文/数字 voiceId、性别和成熟度');
  if (entries.some((entry) => ids.has(entry.voiceId)) || new Set(entries.map((entry) => entry.voiceId)).size !== entries.length) return showToast('voiceId 已存在或重复，请修改后再加入');
  entries.forEach((entry) => {
    const audioUrl = URL.createObjectURL(entry.file);
    state.objectUrls.push(audioUrl);
    state.voices.unshift(normalizeVoice({ ...entry, audioFile: entry.file.name, sourceVoiceId: entry.voiceId, mappingStatus: 'custom-upload', custom: true, origin: 'custom', profile: defaultCustomProfile(entry.gender, entry.maturity, `${entry.voiceName} ${entry.voiceId}`), description: '自定义音色 · 待试听复核' }, audioUrl));
  });
  const customCount = state.voices.filter((voice) => voice.custom).length;
  setImportStatus(els.customVoiceStatus, `当前工作区已添加 ${customCount} 条自定义音色`, true);
  closeCustomVoiceDialog();
  renderAll();
  showToast(`已加入 ${entries.length} 条自定义音色；新资源已置顶显示`);
}

function detectColumn(headers, choices) {
  return headers.findIndex((header) => choices.some((choice) => String(header || '').includes(choice)));
}

function normalizeGender(value) {
  const text = String(value || '').trim().toLowerCase();
  if (/^(女|女性|female|f)$/.test(text)) return 'female';
  if (/^(男|男性|male|m)$/.test(text)) return 'male';
  return 'unknown';
}

function detectRoleGender(explicitValue, setting, intro, opening) {
  const direct = normalizeGender(explicitValue);
  if (direct !== 'unknown') return direct;
  const text = `${setting} ${intro} ${opening}`;
  const inlineGender = text.match(/(?:^|[，,、。；;\s])(女|男)(?:性|生)?(?=$|[，,、。；;\s])/);
  if (inlineGender) return inlineGender[1] === '女' ? 'female' : 'male';
  const female = /(?:^|[，,、。；;\s])女(?:性|生)?(?=$|[，,、。；;\s])|女性|她|小姐|学姐|姐姐|妻子|前女友|老婆|女友/.test(text);
  // Do not treat the 他 character inside words such as 其他 as a male marker.
  const male = /男性|男生|先生|学长|弟弟|他是|他要|他会|他在/.test(text);
  if (female && !male) return 'female';
  if (male && !female) return 'male';
  return 'unknown';
}

function openMatchConfigDialog(pending) {
  state.pendingRoleImport = pending;
  els.matchMaturitySelect.value = state.matchConfig.maturity;
  els.matchStrategySelect.value = state.matchConfig.strategy;
  refreshIcons();
  if (typeof els.matchConfigDialog.showModal === 'function') els.matchConfigDialog.showModal();
  else els.matchConfigDialog.setAttribute('open', '');
}

function openCurrentMatchConfig() {
  if (!state.roles.length || !state.sourceWorkbook) return showToast('请先导入角色表');
  openMatchConfigDialog({ roles: state.roles, sourceWorkbook: state.sourceWorkbook, fileName: state.sourceWorkbook.fileName || '当前角色表' });
}

function applyMatchConfig(event) {
  event.preventDefault();
  if (event.submitter?.value !== 'default') {
    state.pendingRoleImport = null;
    if (els.matchConfigDialog.open) els.matchConfigDialog.close();
    else els.matchConfigDialog.removeAttribute('open');
    showToast('已取消本次角色表导入');
    return;
  }
  state.matchConfig = { maturity: els.matchMaturitySelect.value, strategy: els.matchStrategySelect.value };
  const pending = state.pendingRoleImport;
  state.pendingRoleImport = null;
  if (els.matchConfigDialog.open) els.matchConfigDialog.close();
  else els.matchConfigDialog.removeAttribute('open');
  if (!pending) return;
  state.roles = pending.roles;
  state.selectedRoleId = pending.roles[0]?.id || null;
  state.sourceWorkbook = pending.sourceWorkbook;
  autoMatchAll(true);
  setImportStatus(els.roleImportStatus, `${pending.fileName} · ${pending.roles.length} 个角色 · ${effectiveMaturityLabel()}匹配`, true);
  showToast(`已导入 ${pending.roles.length} 个角色，按${effectiveMaturityLabel()}生成推荐`);
  renderAll();
}

async function importRoleWorkbook(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const workbook = file.name.toLowerCase().endsWith('.csv')
      ? XLSX.read(await file.text(), { type: 'string' })
      : XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const headerRowIndex = rows.findIndex((row) => row.some((cell) => String(cell).includes('角色')));
    const headerIndex = headerRowIndex >= 0 ? headerRowIndex : 0;
    const headers = rows[headerIndex].map((item) => String(item || '').trim());
    const columns = {
      name: detectColumn(headers, ['角色昵称', '昵称', '名称', '名字']),
      intro: detectColumn(headers, ['角色简介', '简介']),
      setting: detectColumn(headers, ['角色设定', '设定', '人设']),
      opening: detectColumn(headers, ['开场白', '开场']),
      gender: detectColumn(headers, ['性别', 'gender', 'Gender']),
    };
    if (columns.name < 0) throw new Error('未找到角色昵称列');
    const roles = rows.slice(headerIndex + 1)
      .filter((row) => row.some((cell) => String(cell || '').trim()))
      .map((row, index) => {
        const get = (key) => columns[key] >= 0 ? String(row[columns[key]] || '') : '';
        const setting = get('setting');
        const intro = get('intro');
        const opening = get('opening');
        return {
          id: `role-${index + 1}`,
          name: get('name') || `角色 ${index + 1}`,
          intro, setting, opening,
          gender: detectRoleGender(get('gender'), setting, intro, opening),
          match: null,
          candidates: [],
          manualOverride: false,
          manualOpen: false,
          raw: row,
        };
      });
    openMatchConfigDialog({ roles, sourceWorkbook: { headers, rows, headerIndex, sheetName, fileName: file.name }, fileName: file.name });
    setImportStatus(els.roleImportStatus, `${file.name} · 已读取，等待选择匹配类型`, true);
  } catch (error) {
    console.error(error);
    showToast(error.message || '角色表读取失败');
  }
}

function loadTestData() {
  const sampleRows = [
    ['林晚', '女', '温柔但有主见的咖啡店店长，擅长安慰别人。', '三十岁，做事稳妥，熟悉每位客人的习惯，只有面对喜欢的人会有一点迟疑。', '你今天看起来有点累，先坐下吧，我给你留了靠窗的位置。'],
    ['顾沉', '男', '冷静的项目负责人，习惯压住情绪。', '三十二岁，逻辑清晰、要求严格，私下会默默照顾团队成员。', '报告放这里。别紧张，我先告诉你最需要改的地方。'],
    ['苏棠', '女', '外表明媚，实际很会观察情绪的策划师。', '二十七岁，社交时自然热情，独处时声音会放低，和熟人相处很有分寸。', '我看得出来你不是来喝咖啡的，说吧，今天想让我帮你什么？'],
  ];
  const headers = ['角色昵称', '性别', '角色简介', '角色设定', '开场白'];
  state.roles = sampleRows.map((row, index) => ({ id: `test-role-${index + 1}`, name: row[0], gender: normalizeGender(row[1]), intro: row[2], setting: row[3], opening: row[4], match: null, candidates: [], manualOverride: false, manualOpen: false, raw: row }));
  state.selectedRoleId = state.roles[0].id;
  state.sourceWorkbook = { headers, rows: [headers, ...sampleRows], headerIndex: 0, sheetName: '测试集', fileName: '角色音色匹配_示例测试集.xlsx' };
  autoMatchAll(true);
  setImportStatus(els.roleImportStatus, '已载入示例测试集 · 3 个角色', true);
  renderAll();
  showToast('已载入测试集，可以直接试听和匹配');
}

function countHits(text, words) { return words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0); }
function roleTarget(role) {
  const text = `${role.intro} ${role.setting} ${role.opening}`;
  const authorityHits = countHits(text, ['上司', '老板', '领导', '总裁', '严格', '强势', '命令', '公司', '掌控']);
  const authority = authorityHits ? Math.min(1, .35 + authorityHits * .22) : .16;
  const warmth = Math.min(1, .28 + countHits(text, ['温柔', '体贴', '照顾', '治愈', '善良', '姐姐', '妥帖']) * .14);
  const intimacy = Math.min(1, .25 + countHits(text, ['前任', '暧昧', '深夜', '想你', '靠近', '红着眼', '亲手', '等你']) * .13);
  const energy = Math.min(1, .22 + countHits(text, ['活泼', '元气', '热情', '阳光', '俏皮', '开朗', '笑']) * .14);
  const restraint = Math.min(1, .25 + countHits(text, ['克制', '冷静', '稳', '理智', '高冷', '沉默', '忍住', '慢']) * .14);
  const brightness = Math.min(1, .35 + countHits(text, ['少女', '年轻', '可爱', '软软', '学生', '妹妹']) * .12);
  return { authority, warmth, intimacy, energy, restraint, brightness };
}

const STYLE_DEFINITIONS = [
  { key: 'authority', label: '强势有压场', words: ['上司', '老板', '领导', '总裁', '强势', '掌控', '女王', '霸道', '命令'] },
  { key: 'warmth', label: '温柔疗愈', words: ['温柔', '体贴', '照顾', '治愈', '善良', '陪伴', '姐姐', '妥帖'] },
  { key: 'intimacy', label: '情绪浓度高', words: ['暧昧', '前任', '深夜', '想你', '靠近', '心动', '诱惑', '占有', '喜欢'] },
  { key: 'energy', label: '明快有活力', words: ['活泼', '元气', '热情', '阳光', '俏皮', '开朗', '笑', '运动'] },
  { key: 'restraint', label: '克制冷静', words: ['克制', '冷静', '稳重', '理智', '高冷', '沉默', '忍住', '慢热', '禁欲'] },
  { key: 'brightness', label: '清亮年轻感', words: ['少女', '年轻', '可爱', '甜', '学生', '妹妹', '灵动'] },
];

const VOICE_STYLE_WORDS = {
  authority: ['御姐', '女王', '霸道', '冷艳', '高冷', '沉稳', '辣妹', '叔系', '熟男'],
  warmth: ['温柔', '治愈', '贴心', '知心', '暖', '白花', '暖男', '忠犬'],
  intimacy: ['妩媚', '媚', '魅', '病娇', '慵懒', '狐', '深情', '磁性', '妖娆'],
  energy: ['活力', '阳光', '元气', '灵动', '气泡', '顽皮', '随性'],
  restraint: ['清冷', '克制', '内敛', '沉稳', '禁欲', '低沉', '烟嗓', '冷艳'],
  brightness: ['少女', '甜', '可爱', '元气', '气泡', '萌', '青梅'],
};

function roleStyle(role) {
  const text = `${role.name} ${role.intro} ${role.setting} ${role.opening}`;
  const target = roleTarget(role);
  const matched = STYLE_DEFINITIONS.filter((style) => countHits(text, style.words) > 0)
    .map((style) => style.label);
  if (!matched.length) {
    const fallback = [...STYLE_DEFINITIONS].sort((a, b) => target[b.key] - target[a.key]).slice(0, 2).map((style) => style.label);
    return fallback;
  }
  return matched.slice(0, 3);
}

function voiceStyleHits(voice, key) {
  const text = `${voice.voiceName} ${voice.voiceId} ${voice.description}`.toLowerCase();
  return countHits(text, VOICE_STYLE_WORDS[key].map((word) => word.toLowerCase()));
}

function matchRationale(role, voice) {
  const target = roleTarget(role);
  const traits = [...STYLE_DEFINITIONS]
    .map((style) => ({ ...style, fit: target[style.key] * .65 + (voice.profile[style.key] || .5) * .35 + voiceStyleHits(voice, style.key) * .08 }))
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 2)
    .map((style) => style.label);
  return `契合：${traits.join('、')}`;
}

function scoreVoice(role, voice) {
  const target = roleTarget(role);
  const profile = voice.profile;
  const weights = { authority: 1.3, warmth: 1.12, intimacy: 1, energy: .78, restraint: 1.18, brightness: .82 };
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const featureFit = 1 - Object.entries(weights).reduce((sum, [key, weight]) => sum + Math.abs((target[key] ?? .5) - (profile[key] ?? .5)) * weight, 0) / totalWeight;
  const text = `${role.name} ${role.intro} ${role.setting} ${role.opening}`;
  const labelFit = STYLE_DEFINITIONS.reduce((sum, style) => sum + (countHits(text, style.words) ? Math.min(2, voiceStyleHits(voice, style.key)) : 0), 0);
  // The visible score is a calibrated suitability index for ranking a finite voice pool, not a probability claim.
  return Math.max(60, Math.min(98, Math.round(68 + featureFit * 24 + Math.min(6, labelFit * 1.5))));
}

function effectiveMaturity() {
  if (state.matchConfig.strategy === 'mature' || state.matchConfig.strategy === 'young') return state.matchConfig.strategy;
  return state.matchConfig.maturity;
}
function effectiveMaturityLabel() { return effectiveMaturity() === 'young' ? '偏幼态/年轻' : '偏成熟'; }

function candidatesFor(role) {
  if (!['female', 'male'].includes(role.gender)) return [];
  const maturity = effectiveMaturity();
  const candidates = state.voices
    .filter((voice) => voice.gender === role.gender && voice.maturity === maturity && !voice.custom)
    .map((voice) => ({ voiceId: voice.voiceId, score: scoreVoice(role, voice) }))
    .sort((a, b) => b.score - a.score);
  return candidates;
}

function autoMatchAll(force = false) {
  const usage = new Map();
  const roleCounts = state.roles.reduce((counts, role) => {
    counts[role.gender] = (counts[role.gender] || 0) + 1;
    return counts;
  }, {});
  state.roles.forEach((role) => {
    role.candidates = candidatesFor(role);
    if (!role.candidates.length) {
      role.match = null;
      return;
    }
    const eligible = state.voices.filter((voice) => voice.gender === role.gender && voice.maturity === effectiveMaturity() && !voice.custom).length;
    const perVoiceLimit = Math.max(1, Math.ceil((roleCounts[role.gender] || 1) / Math.max(1, eligible)) + 1);
    const existingVoice = getVoice(role.match);
    if (!force && role.manualOverride && existingVoice?.gender === role.gender && existingVoice?.maturity === effectiveMaturity()) {
      usage.set(role.match, (usage.get(role.match) || 0) + 1);
      return;
    }
    const diversified = role.candidates
      .map((candidate) => ({ ...candidate, selectionScore: candidate.score - (usage.get(candidate.voiceId) || 0) * 9 }))
      .sort((a, b) => b.selectionScore - a.selectionScore);
    const selected = diversified.find((candidate) => (usage.get(candidate.voiceId) || 0) < perVoiceLimit) || diversified[0];
    role.candidates = diversified;
    role.match = selected?.voiceId || null;
    if (role.match) usage.set(role.match, (usage.get(role.match) || 0) + 1);
  });
}

function selectedRole() { return state.roles.find((role) => role.id === state.selectedRoleId) || null; }
function getVoice(voiceId) { return state.voices.find((voice) => voice.voiceId === voiceId) || null; }

function assignVoice(roleId, voiceId) {
  const role = state.roles.find((item) => item.id === roleId);
  const voice = getVoice(voiceId);
  if (!role) return;
  if (!voice || voice.gender !== role.gender) return showToast('该音色与角色性别不一致，无法匹配');
  role.match = voiceId;
  role.manualOverride = true;
  renderAll();
  showToast(`已为 ${role.name} 更换音色`);
}

function renderRoleList() {
  if (!state.roles.length) return;
  els.roleQueueTitle.textContent = `共 ${state.roles.length} 个角色`;
  els.roleList.innerHTML = state.roles.map((role, index) => `
    <button class="role-list-item ${role.id === state.selectedRoleId ? 'selected' : ''}" data-role-id="${role.id}">
      <span class="role-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="role-text"><strong>${role.name}</strong><span>${role.intro || role.setting || '待补充角色简介'}</span></span>
      <span class="match-state ${role.match ? 'matched' : role.gender === 'unknown' ? 'needs-gender' : ''}">${icon(role.match ? 'check' : role.gender === 'unknown' ? 'triangle-alert' : 'circle-dashed')}</span>
    </button>`).join('');
  $$('.role-list-item').forEach((button) => button.addEventListener('click', () => { state.selectedRoleId = button.dataset.roleId; renderRoleList(); renderRoleDetail(); }));
}

function audioButton(voice) {
  return voice?.audioUrl ? `<audio controls preload="none" src="${voice.audioUrl}"></audio>` : `<span class="audio-missing">${icon('volume-x')} 未找到音频文件</span>`;
}

function renderRoleDetail() {
  const role = selectedRole();
  if (!role) return;
  const selected = getVoice(role.match);
  const candidates = role.candidates.slice(0, 3).map((item) => ({ ...item, voice: getVoice(item.voiceId) })).filter((item) => item.voice);
  const recommendedIds = new Set(candidates.map((item) => item.voiceId));
  const manualVoices = state.voices.filter((voice) => voice.gender === role.gender && !recommendedIds.has(voice.voiceId)).sort((a, b) => Number(b.custom) - Number(a.custom));
  const genderLabel = role.gender === 'female' ? '女性角色' : role.gender === 'male' ? '男性角色' : '待确认性别';
  const styleSummary = roleStyle(role).join(' · ');
  els.roleDetailPanel.innerHTML = `<div class="role-detail">
    <div class="role-detail-top"><div class="role-avatar">${role.name.slice(0, 1)}</div><div class="role-detail-title"><p class="eyebrow">${genderLabel} · 自动匹配：${effectiveMaturityLabel()}</p><h2>${role.name}</h2><p>${role.match ? `当前匹配：${selected ? voiceLabel(selected) : role.match}` : role.gender === 'unknown' ? '请先确认角色性别，再生成候选' : `暂无可用的${effectiveMaturityLabel()}候选`}</p></div><label class="gender-control">角色性别<select data-role-gender><option value="unknown" ${role.gender === 'unknown' ? 'selected' : ''}>待确认</option><option value="female" ${role.gender === 'female' ? 'selected' : ''}>女</option><option value="male" ${role.gender === 'male' ? 'selected' : ''}>男</option></select></label></div>
    <div class="role-style"><span>角色风格</span><strong>${styleSummary}</strong><small>由简介、设定和开场白综合提取</small></div>
    <nav class="detail-action-nav" aria-label="音色操作"><button data-scroll-target="recommended-voices">推荐音色</button><button data-scroll-target="manual-voices">手动调整音色</button></nav>
    <details class="role-source-content"><summary>角色文本内容 <span>简介 · 设定 · 开场白</span></summary><div class="text-block"><h4>角色简介</h4><p>${role.intro || '未读取到角色简介'}</p></div><div class="text-block"><h4>角色设定</h4><p>${role.setting || '未读取到角色设定'}</p></div><div class="text-block"><h4>开场白</h4><p>${role.opening || '未读取到开场白'}</p></div></details>
    <section class="candidate-section" id="recommended-voices"><header><h3>推荐音色</h3><span>适配指数基于角色风格和资源库内相对排序</span></header><div class="candidate-list">
      ${candidates.length ? candidates.map(({ voice, score }) => `<article class="candidate-card ${voice.voiceId === role.match ? 'selected' : ''}"><div class="score-mark">${score}</div><div class="candidate-info"><div class="candidate-head"><strong>${voiceLabel(voice)}</strong><code>${voice.voiceId}</code><span class="tag ${voice.maturity}">${maturityText(voice)}</span></div><p>${matchRationale(role, voice)} · ${voice.description || '声线特征待补充'}</p></div><div class="candidate-actions"><button class="mini-icon" title="试听 ${voiceLabel(voice)}" data-play="${voice.voiceId}">${icon('play')}</button><button class="assign-button" data-assign="${voice.voiceId}">${voice.voiceId === role.match ? '已匹配' : '使用此音色'}</button></div></article>`).join('') : `<div class="empty-state"><strong>没有可用的${effectiveMaturityLabel()}候选</strong><span>请确认资源包中有对应性别的${effectiveMaturityLabel()}音色，或切换匹配类型。</span></div>`}
    </div></section>
    <section class="manual-section" id="manual-voices"><header><h3>手动调整音色</h3><span>${genderLabel} · 自定义音色优先 · 包含偏成熟与偏幼态/年轻</span></header><div class="manual-picker">${manualVoices.length ? manualVoices.map((voice) => `<article class="mini-voice ${voice.voiceId === role.match ? 'selected' : ''} ${voice.custom ? 'custom-voice-card' : ''}"><div class="mini-voice-title"><strong>${voiceLabel(voice)}</strong><div class="mini-voice-tags">${voice.custom ? '<span class="tag custom">自定义</span>' : ''}<span class="tag ${voice.maturity}">${maturityText(voice)}</span></div></div><code>${voice.voiceId}</code><p>${voice.description || '声线特征待补充'}</p><div class="mini-voice-actions"><button class="mini-icon" title="试听 ${voiceLabel(voice)}" data-play="${voice.voiceId}">${icon('play')}</button><button class="assign-button" data-assign="${voice.voiceId}">${voice.voiceId === role.match ? '已匹配' : '匹配'}</button></div></article>`).join('') : '<p class="manual-empty">请先选择角色性别，查看可手动分配的音色。</p>'}</div></section>
  </div>`;
  $$('#roleDetailPanel [data-assign]').forEach((button) => button.addEventListener('click', () => assignVoice(role.id, button.dataset.assign)));
  $$('#roleDetailPanel [data-play]').forEach((button) => button.addEventListener('click', () => {
    const voice = getVoice(button.dataset.play);
    if (!voice?.audioUrl) return showToast('该音色未绑定音频文件');
    const player = new Audio(voice.audioUrl); player.play();
  }));
  $('#roleDetailPanel [data-role-gender]')?.addEventListener('change', (event) => {
    role.gender = event.target.value;
    role.match = null;
    role.manualOverride = false;
    role.candidates = candidatesFor(role);
    role.match = role.candidates[0]?.voiceId || null;
    renderAll();
    showToast(role.gender === 'unknown' ? '已清除性别，暂停自动匹配' : `已切换为${role.gender === 'female' ? '女' : '男'}角色候选`);
  });
  $$('#roleDetailPanel [data-scroll-target]').forEach((button) => button.addEventListener('click', () => {
    $(`#${button.dataset.scrollTarget}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  refreshIcons();
}

function renderLibrary() {
  const { gender, maturity, search } = state.filters;
  const list = state.voices.filter((voice) => (gender === 'all' || voice.gender === gender) && (maturity === 'all' || voice.maturity === maturity) && `${voice.voiceName} ${voice.voiceId}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(b.custom) - Number(a.custom));
  els.voiceGrid.innerHTML = list.length ? list.map((voice) => `<article class="voice-card ${voice.custom ? 'custom-voice-card' : ''}"><div class="voice-card-top"><div class="voice-card-tags">${voice.custom ? '<span class="tag custom">自定义</span>' : ''}<span class="tag ${voice.maturity}">${maturityText(voice)}</span></div><span class="tag gender">${genderText(voice)}</span></div><h3>${voiceLabel(voice)}</h3><code>${voice.voiceId}</code><div class="voice-meta"><span class="tag ${voice.maturity}">${voice.description || '声线待标注'}</span></div><div class="audio-row">${audioButton(voice)}</div><button class="assign-button" data-library-assign="${voice.voiceId}">${icon('plus')}匹配到当前角色</button></article>`).join('') : `<div class="empty-state wide">${icon('search-x')}<strong>没有符合条件的音色</strong><span>切换筛选条件，或先导入资源包。</span></div>`;
  $$('#voiceGrid [data-library-assign]').forEach((button) => button.addEventListener('click', () => { const role = selectedRole(); if (!role) return showToast('请先在角色队列选择角色'); assignVoice(role.id, button.dataset.libraryAssign); }));
  refreshIcons();
}

function renderExport() {
  const matched = state.roles.filter((role) => role.match).length;
  const total = state.roles.length;
  els.exportTitle.textContent = total ? `${matched} 个角色已完成音色匹配` : '尚未导入角色表';
  els.exportMeta.textContent = total ? `导出后会在原字段后追加“匹配voiceId”列。` : '导入角色表并完成匹配后，可以导出 XLSX。';
  els.exportStatus.textContent = `${matched} / ${total} 已匹配`;
  els.exportButton.disabled = !total || matched !== total;
  els.exportPreview.innerHTML = total ? `<table class="result-table"><thead><tr><th>角色</th><th>性别</th><th>匹配音色</th><th>voiceId</th></tr></thead><tbody>${state.roles.map((role) => { const voice = getVoice(role.match); return `<tr><td>${role.name}</td><td>${role.gender === 'female' ? '女' : '男'}</td><td>${voice ? voiceLabel(voice) : '待匹配'}</td><td>${voice ? `<code>${voice.voiceId}</code>` : '—'}</td></tr>`; }).join('')}</tbody></table>` : `<div class="empty-state">${icon('list-checks')}<strong>暂无匹配结果</strong><span>导入角色表后完成匹配，这里会显示导出预览。</span></div>`;
}

function renderSummary() {
  const matureFemale = state.voices.filter((voice) => voice.gender === 'female' && voice.maturity === 'mature').length;
  const matureMale = state.voices.filter((voice) => voice.gender === 'male' && voice.maturity === 'mature').length;
  const youngFemale = state.voices.filter((voice) => voice.gender === 'female' && voice.maturity !== 'mature').length;
  const youngMale = state.voices.filter((voice) => voice.gender === 'male' && voice.maturity !== 'mature').length;
  els.femaleCount.textContent = matureFemale;
  els.maleCount.textContent = matureMale;
  els.femaleYoungCount.textContent = youngFemale;
  els.maleYoungCount.textContent = youngMale;
  els.roleCount.textContent = state.roles.length;
}

function renderAll() {
  renderSummary();
  if (state.roles.length) { renderRoleList(); renderRoleDetail(); }
  renderLibrary(); renderExport(); refreshIcons();
}

function exportWorkbook() {
  if (!state.sourceWorkbook || !state.roles.length) return;
  const { headers, rows, headerIndex, sheetName } = state.sourceWorkbook;
  const dataRows = rows.slice(headerIndex + 1);
  const matchedRows = dataRows.map((row, index) => [...row, state.roles[index]?.match || '']);
  const output = [headers.concat('匹配voiceId'), ...matchedRows];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(output), sheetName || '角色匹配');
  XLSX.writeFile(workbook, `角色音色匹配_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('已导出带 voiceId 的 XLSX');
}

function bindEvents() {
  els.voiceFolderInput.addEventListener('change', importVoiceFolder);
  els.roleFileInput.addEventListener('change', importRoleWorkbook);
  els.customVoiceInput.addEventListener('change', (event) => {
    const files = [...event.target.files];
    if (files.length) openCustomVoiceDialog(files);
    event.target.value = '';
  });
  els.customVoiceForm.addEventListener('submit', addCustomVoices);
  els.matchConfigForm.addEventListener('submit', applyMatchConfig);
  $('#loadTestDataButton')?.addEventListener('click', loadTestData);
  $('#loadTestDataButtonTop')?.addEventListener('click', loadTestData);
  $('#matchConfigButton').addEventListener('click', openCurrentMatchConfig);
  $('#matchAllButton').addEventListener('click', () => { autoMatchAll(true); renderAll(); showToast('已重新生成全部推荐，并启用音色分散逻辑'); });
  els.exportButton.addEventListener('click', exportWorkbook);
  $('#resetApp').addEventListener('click', () => { state.roles = []; state.selectedRoleId = null; state.sourceWorkbook = null; els.roleFileInput.value = ''; setImportStatus(els.roleImportStatus, '等待导入角色表'); renderAll(); showToast('已清空角色工作区'); });
  $$('.view-tab').forEach((button) => button.addEventListener('click', () => { $$('.view-tab').forEach((item) => item.classList.toggle('active', item === button)); $$('.view-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `view-${button.dataset.view}`)); els.topMatchToolbar.classList.toggle('hidden', button.dataset.view !== 'match'); }));
  $$('#genderFilter button').forEach((button) => button.addEventListener('click', () => { state.filters.gender = button.dataset.value; $$('#genderFilter button').forEach((item) => item.classList.toggle('selected', item === button)); renderLibrary(); }));
  $$('#maturityFilter button').forEach((button) => button.addEventListener('click', () => { state.filters.maturity = button.dataset.value; $$('#maturityFilter button').forEach((item) => item.classList.toggle('selected', item === button)); renderLibrary(); }));
  els.voiceSearch.addEventListener('input', (event) => { state.filters.search = event.target.value; renderLibrary(); });
  window.addEventListener('keydown', (event) => { if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); els.voiceSearch.focus(); } });
}

bindEvents();
refreshIcons();
loadDemoManifest();
