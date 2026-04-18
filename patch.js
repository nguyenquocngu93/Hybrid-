const fs = require('fs');
const path = require('path');
const filePath = path.join(process.env.HOME, 'stremio-addon', 'index.js');

console.log('🔧 开始修补 index.js...');
let content = fs.readFileSync(filePath, 'utf8');

// 1. 在 DEFAULT_CONFIG 中添加 preferPack 和 searchLanguage
const oldDefault = "animeMode: false,";
content = content.replace(oldDefault, oldDefault + '\n    preferPack: true,\n    searchLanguage: \'ru\',');

// 2. 在 buildConfigPage 中插入 UI 卡片
const animeCardMarker = '<div class="card"><div class="card-header"><div class="card-icon ci-red">🎌</div><h2>Anime Mode</h2>';
const newCard = `
<div class="card"><div class="card-header"><div class="card-icon ci-purple">🔍</div><h2>Tùy chỉnh tìm kiếm</h2></div>
<div class="fg"><label>🌐 Ngôn ngữ tìm kiếm</label>
<select id="searchLanguage">
<option value="ru" ' + (cfg.searchLanguage === 'ru' ? 'selected' : '') + '>🇷🇺 Tiếng Nga (khuyến nghị)</option>
<option value="en" ' + (cfg.searchLanguage === 'en' ? 'selected' : '') + '>🇬🇧 Tiếng Anh</option>
</select><p class="hint">Tiếng Nga cho kết quả tốt hơn trên jac.red và Knaben</p></div>
<div class="trow"><div class="trow-info"><div class="trow-label">📦 Ưu tiên Pack</div><div class="trow-sub">Tắt để tìm tập lẻ chính xác (SxxExx)</div></div><label class="sw"><input type="checkbox" id="preferPack"' + (cfg.preferPack !== false ? ' checked' : '') + '><span class="sl"></span></label></div>
</div>`;

content = content.replace(animeCardMarker, newCard + animeCardMarker);

// 3. 更新 getCurrentConfig
const oldGetter = "animeMode:document.getElementById(\"animeMode\").checked,";
const newGetter = "animeMode:document.getElementById(\"animeMode\").checked,\n            preferPack:document.getElementById(\"preferPack\").checked,\n            searchLanguage:document.getElementById(\"searchLanguage\").value,";
content = content.replace(oldGetter, newGetter);

// 4. 升级 searchKnaben 函数签名
content = content.replace(
    "function searchKnaben(query, maxResults) {",
    "function searchKnaben(query, maxResults, type, preferPack, season, episode, language) {"
);

// 5. 替换 URL 构造逻辑
const oldUrlLine = "var url = KNABEN_URL + encodeURIComponent(query);";
const newUrlLogic = `
    var baseUrl = 'https://knaben.org/search/';
    var filterSegment = '0/1/bytes';
    if (type === 'movie') filterSegment = '3000000/1/bytes';
    else if (type === 'series') filterSegment = '2000000/1/bytes';
    var finalQuery = query;
    if (type === 'series' && !preferPack && season && episode) {
        var s = String(season).padStart(2, '0');
        var e = String(episode).padStart(2, '0');
        finalQuery = query + ' S' + s + 'E' + e;
    }
    var url = baseUrl + encodeURIComponent(finalQuery) + '/' + filterSegment;`;
content = content.replace(oldUrlLine, newUrlLogic);

// 6. 更新 handleStream 中对 searchKnaben 的调用
const oldCall = "return searchKnaben(query, cfg.maxResults || 30);";
const newCall = `var useRu = (cfg.searchLanguage === 'ru');
            var finalQuery = useRu ? ruTitle : originalTitle;
            if (!finalQuery) finalQuery = originalTitle || imdbId;
            return searchKnaben(finalQuery, cfg.maxResults || 30, type, cfg.preferPack, season, episode, cfg.searchLanguage);`;
content = content.replace(oldCall, newCall);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ 修补完成！请运行: pm2 restart stremio-addon');
