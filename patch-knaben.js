const fs = require('fs');
const path = require('path');
const filePath = path.join(process.env.HOME, 'stremio-addon', 'index.js');

console.log('🔧 开始修补 index.js ...');
let content = fs.readFileSync(filePath, 'utf8');

// ---------- 1. 禁用 Knaben 的俄语搜索 ----------
content = content.replace(
    /var useRu = \(cfg\.searchLanguage === 'ru'\);/g,
    "var useRu = false; // 禁用俄语搜索，只使用英语"
);

// ---------- 2. 为 Knaben Pack 添加 Season 过滤 ----------
// 定位到 Knaben 结果处理部分：在 var isPack = ... 之后插入过滤逻辑
const packFilterLogic = `
                // 过滤 Knaben Pack 的 Season
                if (isPack && season > 0) {
                    var sPad = String(season).padStart(2, '0');
                    var seasonPattern = new RegExp('S' + sPad + '(?:[^\\\\d]|$)|Season\\\\s*' + season + '(?:[^\\\\d]|$)|第\\\\s*' + season + '\\\\s*季|S' + season + '(?:[^\\\\d]|$)', 'i');
                    var otherSeasonPattern = /S\\\\d{1,2}(?:[^\\\\d]|$)|Season\\\\s*\\\\d|第\\\\s*\\\\d+\\\\s*季/gi;
                    var hasOtherSeason = false;
                    var matches = title.match(otherSeasonPattern);
                    if (matches) {
                        for (var i = 0; i < matches.length; i++) {
                            if (!seasonPattern.test(matches[i])) {
                                var otherSeasonMatch = matches[i].match(/\\\\d+/);
                                if (otherSeasonMatch && parseInt(otherSeasonMatch[0]) !== season) {
                                    hasOtherSeason = true; break;
                                }
                            }
                        }
                    }
                    if (hasOtherSeason) return;
                }`;

// 在 "var isPack = (type === 'series' && !isSingleEpisode);" 之后插入
content = content.replace(
    /var isPack = \(type === 'series' && !isSingleEpisode\);/g,
    "var isPack = (type === 'series' && !isSingleEpisode);" + packFilterLogic
);

// ---------- 3. 增加超时和重试次数 ----------
content = content.replace(/timeout: 60000/g, "timeout: 120000");
content = content.replace(/timeout: 20000/g, "timeout: 120000");
content = content.replace(/timeout: 15000/g, "timeout: 120000");
content = content.replace(/timeout: 10000/g, "timeout: 120000");
content = content.replace(/timeout: 8000/g, "timeout: 120000");
content = content.replace(/maxAttempts = 6/g, "maxAttempts = 12");

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ 修补完成！');
