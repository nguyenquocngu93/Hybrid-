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
            
            results.push({
                index: i,
                title: title.substring(0, 60),
                size: sizeStr,
                seeds: seeds,
                magnet: magnet ? magnet.substring(0, 50) + '...' : 'NO MAGNET'
            });
        });
        
        console.log('\n📊 Tổng số magnet link tìm thấy:', results.length);
        console.log('\n📋 10 kết quả đầu tiên:');
        results.slice(0, 10).forEach(r => {
            console.log(`[${r.index}] ${r.size} | 🌱 ${r.seeds} | ${r.title}`);
        });
        
        var found82 = results.filter(r => r.size.includes('82'));
        console.log('\n🔍 File có size 82GB:', found82.length);
        found82.forEach(r => console.log('   ', r));
        
        console.log('\n📋 Tất cả các dòng trong bảng (10 dòng đầu):');
        $('table tbody tr').each(function(i, row) {
            if (i >= 10) return false;
            var cols = $(row).find('td');
            if (cols.length === 0) return;
            console.log(`[${i}] Cols: ${cols.length} | Size: ${$(cols[2]).text().trim()} | Title: ${$(cols[1]).text().trim().substring(0, 40)}`);
        });
    })
    .catch(e => console.error('❌ Lỗi:', e.message));
