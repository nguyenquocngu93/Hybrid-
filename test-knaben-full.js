var fetch = require('node-fetch');
var cheerio = require('cheerio');

var query = 'the housemaid 2025';
var url = 'https://knaben.org/search/?q=' + encodeURIComponent(query);

console.log('🔍 Đang fetch:', url);

fetch(url, { timeout: 20000 })
    .then(r => r.text())
    .then(html => {
        var $ = cheerio.load(html);
        var results = [];
        
        $('a[href^="magnet:"]').each(function(i, link) {
            var magnet = $(link).attr('href');
            var row = $(link).closest('tr');
            if (row.length === 0) row = $(link).parent().parent();
            
            var title = row.find('td:eq(1)').text().trim();
            if (!title) title = $(link).text().trim();
            
            var sizeStr = row.find('td:eq(2)').text().trim();
            var seeds = parseInt(row.find('td:eq(4)').text().trim()) || 0;
            
            // Parse size to GB for sorting
            var sizeGB = 0;
            if (sizeStr) {
                var match = sizeStr.match(/([\d.]+)\s*GB/i);
                if (match) sizeGB = parseFloat(match[1]);
            }
            
            results.push({
                index: i,
                title: title.substring(0, 70),
                size: sizeStr,
                sizeGB: sizeGB,
                seeds: seeds,
                hasMagnet: !!magnet
            });
        });
        
        // Sắp xếp theo dung lượng giảm dần
        results.sort(function(a, b) { return b.sizeGB - a.sizeGB; });
        
        console.log('\n📊 Tổng số magnet link:', results.length);
        console.log('\n📋 TOP 20 SẮP XẾP THEO DUNG LƯỢNG:');
        results.slice(0, 20).forEach(function(r) {
            console.log(`[${r.index}] ${r.size} | 🌱 ${r.seeds} | ${r.title}`);
        });
        
        // Kiểm tra file 82.36 GB
        var found82 = results.filter(function(r) { return r.size.includes('82.36'); });
        console.log('\n🔍 File 82.36 GB:', found82.length > 0 ? '✅ CÓ' : '❌ KHÔNG');
        if (found82.length > 0) {
            console.log('   Chi tiết:', found82[0]);
        }
        
        // Kiểm tra tất cả file > 80GB
        var bigFiles = results.filter(function(r) { return r.sizeGB > 80; });
        console.log('\n📦 File > 80GB:', bigFiles.length);
        bigFiles.forEach(function(r) {
            console.log(`   ${r.size} | 🌱 ${r.seeds} | Magnet: ${r.hasMagnet ? '✅' : '❌'}`);
        });
    })
    .catch(e => console.error('❌ Lỗi:', e.message));
