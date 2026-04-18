const fs = require('fs');
const path = require('path');
const filePath = path.join(process.env.HOME, 'stremio-addon', 'index.js');

console.log('🚀 Bắt đầu nâng cấp Hybrid Addon...');
let content = fs.readFileSync(filePath, 'utf8');

// ===== 1. Cập nhật DEFAULT_CONFIG =====
const oldConfigLine = "animeMode: false,";
const newConfigLines = `    animeMode: false,
    preferPack: true,          // true: ưu tiên pack, false: ưu tiên tập lẻ
    searchLanguage: 'ru',      // 'ru' hoặc 'en'`;
content = content.replace(oldConfigLine, oldConfigLine + '\n' + newConfigLines);
console.log('✅ Đã thêm preferPack và searchLanguage vào DEFAULT_CONFIG');

// ===== 2. Thêm UI trong buildConfigPage =====
// Tìm vị trí trước card "Anime Mode" để chèn card mới
const animeCardStart = '<div class="card"><div class="card-header"><div class="card-icon ci-red">🎌</div><h2>Anime Mode</h2>';
const searchPrefCard = `
<div class="card"><div class="card-header"><div class="card-icon ci-purple">🔍</div><h2>Tùy chỉnh tìm kiếm</h2></div>
<div class="fg"><label>🌐 Ngôn ngữ tìm kiếm</label>
<select id="searchLanguage">
    <option value="ru" ' + (cfg.searchLanguage === 'ru' ? 'selected' : '') + '>🇷🇺 Tiếng Nga (khuyến nghị)</option>
    <option value="en" ' + (cfg.searchLanguage === 'en' ? 'selected' : '') + '>🇬🇧 Tiếng Anh</option>
</select><p class="hint">Tiếng Nga cho kết quả tốt hơn trên jac.red và Knaben</p></div>
<div class="trow"><div class="trow-info"><div class="trow-label">📦 Ưu tiên Pack</div><div class="trow-sub">Tắt để tìm tập lẻ chính xác (SxxExx)</div></div><label class="sw"><input type="checkbox" id="preferPack"' + (cfg.preferPack !== false ? ' checked' : '') + '><span class="sl"></span></label></div>
</div>`;

content = content.replace(animeCardStart, searchPrefCard + animeCardStart);
console.log('✅ Đã thêm card Tùy chỉnh tìm kiếm vào giao diện');

// ===== 3. Cập nhật getCurrentConfig() để đọc giá trị mới =====
const oldGetter = 'animeMode:document.getElementById("animeMode").checked,';
const newGetter = `animeMode:document.getElementById("animeMode").checked,
            preferPack:document.getElementById("preferPack").checked,
            searchLanguage:document.getElementById("searchLanguage").value,`;
content = content.replace(oldGetter, newGetter);
console.log('✅ Đã cập nhật getCurrentConfig()');

// ===== 4. Nâng cấp hàm searchKnaben =====
const oldSearchKnaben = 'function searchKnaben(query, maxResults) {';
const newSearchKnaben = `function searchKnaben(query, maxResults, type, preferPack, season, episode, language) {
    var baseUrl = 'https://knaben.org/search/';
    var filterSegment = '0/1/bytes'; // Mặc định

    // Xác định filter dựa trên type
    if (type === 'movie') {
        filterSegment = '3000000/1/bytes';
    } else if (type === 'series') {
        filterSegment = '2000000/1/bytes';
    }

    // Nếu không ưu tiên pack và là series, tìm chính xác tập
    var finalQuery = query;
    if (type === 'series' && !preferPack && season && episode) {
        var s = String(season).padStart(2, '0');
        var e = String(episode).padStart(2, '0');
        finalQuery = query + ' S' + s + 'E' + e;
    }

    var url = baseUrl + encodeURIComponent(finalQuery) + '/' + filterSegment;
    // console.log('[Knaben] Fetching:', url);`;

// Thay thế function cũ
content = content.replace(oldSearchKnaben, newSearchKnaben);

// Cập nhật logic scrape bên trong (thêm các tham số mới nếu cần)
console.log('✅ Đã nâng cấp hàm searchKnaben');

// ===== 5. Cập nhật cách gọi searchKnaben trong handleStream =====
const oldCall = 'return searchKnaben(query, cfg.maxResults || 30);';
const newCall = `var useRu = (cfg.searchLanguage === 'ru');
            var finalQuery = useRu ? ruTitle : originalTitle;
            if (!finalQuery) finalQuery = originalTitle || imdbId;
            // Nếu không ưu tiên pack và là series -> query đã được thêm SxxExx trong hàm searchKnaben
            return searchKnaben(finalQuery, cfg.maxResults || 30, type, cfg.preferPack, season, episode, cfg.searchLanguage);`;
content = content.replace(oldCall, newCall);
console.log('✅ Đã cập nhật lời gọi searchKnaben');

// ===== 6. Lưu file =====
fs.writeFileSync(filePath, content, 'utf8');
console.log('🎉 Nâng cấp hoàn tất! Hãy chạy "pm2 restart stremio-addon"');
