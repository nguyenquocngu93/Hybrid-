var http = require('http');
var fetch = require('node-fetch');

var JAC_RED_DOMAINS = {
    'jac.red': 'https://jac.red/api/v1.0/torrents',
    'jac-red.ru': 'https://jac-red.ru/api/v1.0/torrents',
    'jr.maxvol.pro': 'https://jr.maxvol.pro/api/v1.0/torrents',
    'ru.jacred.pro': 'https://ru.jacred.pro/api/v1.0/torrents',
    'jacred.stream': 'https://jacred.stream/api/v1.0/torrents'
};
var DEFAULT_JACRED_DOMAIN = 'jac.red';

var TMDB_API_KEY = '6979c8ec101ed849f44d197c86582644';
var PORT = 7000;

var BITSEARCH_API = 'https://bitsearch.to/api/v1/search';
var TORRENTCSV_API = 'https://torrents-csv.com/service/search';

function buildMagnet(infohash, title) {
    return 'magnet:?xt=urn:btih:' + infohash + '&dn=' + encodeURIComponent(title || '');
}

function searchBitsearch(query, maxResults) {
    return fetch(BITSEARCH_API + '?q=' + encodeURIComponent(query) + '&limit=' + (maxResults || 20), { timeout: 10000 })
        .then(function(r) { return r.ok ? r.json() : { results: [] }; })
        .then(function(data) {
            var results = data.results || [];
            return results.map(function(item) {
                return {
                    title: item.title || '',
                    magnet: buildMagnet(item.infohash, item.title),
                    sizeGB: (item.size || 0) / (1024 * 1024 * 1024),
                    seeds: item.seeders || 0,
                    tracker: 'Bitsearch',
                    source: 'bitsearch'
                };
            });
        })
        .catch(function() { return []; });
}

function searchTorrentCsv(query, maxResults) {
    return fetch(TORRENTCSV_API + '?q=' + encodeURIComponent(query) + '&size=' + (maxResults || 20), { timeout: 10000 })
        .then(function(r) { return r.ok ? r.json() : { torrents: [] }; })
        .then(function(data) {
            var torrents = data.torrents || [];
            return torrents.map(function(item) {
                return {
                    title: item.name || '',
                    magnet: buildMagnet(item.infohash, item.name),
                    sizeGB: (item.size_bytes || 0) / (1024 * 1024 * 1024),
                    seeds: item.seeders || 0,
                    tracker: 'TorrentCSV',
                    source: 'torrentcsv'
                };
            });
        })
        .catch(function() { return []; });
}

function searchBitsearchAndCsv(query, maxResults) {
    var allResults = [];
    var seen = new Map();
    
    function addResults(results, sourceName) {
        var added = 0;
        results.forEach(function(r) {
            if (!r.magnet) return;
            var hashMatch = r.magnet.match(/btih:([a-fA-F0-9]{40})/i);
            var key = hashMatch ? hashMatch[1].toLowerCase() : r.magnet;
            if (!seen.has(key)) {
                seen.set(key, true);
                allResults.push(r);
                added++;
            }
        });
        console.log('[' + sourceName + '] +' + added + ' unique streams');
    }
    
    return Promise.all([
        searchBitsearch(query, maxResults).then(function(r) { addResults(r, 'Bitsearch'); }),
        searchTorrentCsv(query, maxResults).then(function(r) { addResults(r, 'TorrentCSV'); })
    ]).then(function() {
        allResults.sort(function(a, b) { return b.seeds - a.seeds; });
        return allResults.slice(0, maxResults);
    });
}

var TMDB_CACHE = {};

var DEFAULT_TORRENTIO_CONFIG = {
    providers        : ['yts','eztv','rarbg','1337x','thepiratebay','kickasstorrents','torrentgalaxy','magnetdl','horriblesubs','nyaasi','tokyotosho','anidex','nekobt','rutor','rutracker','torrent9','ilcorsaronero','mejortorrent','wolfmax4k','cinecalidad','besttorrents'],
    sortBy           : 'size',
    language         : 'russian,ukrainian',
    qualityfilter    : ['480p']
};

var DEFAULT_CONFIG = Object.assign({
    torrServerUrl      : '',
    jacredEnabled      : true,
    torrentioEnabled   : true,
    bitsearchEnabled   : true,
    maxResults         : 30,
    jacredDomain       : DEFAULT_JACRED_DOMAIN,
    animeMode          : false,
    commonSortBy       : 'size',
    commonQualityFilter: []
}, DEFAULT_TORRENTIO_CONFIG);

function decodeConfig(str) {
    try {
        var cleanStr = str.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/manifest\.json$/, '').replace(/\/configure$/, '');
        var configPart = cleanStr.split('/')[0];
        if (!configPart) return null;
        var b64 = configPart.replace(/-/g,'+').replace(/_/g,'/');
        while (b64.length % 4) b64 += '=';
        var decoded = JSON.parse(Buffer.from(b64,'base64').toString('utf8'));
        return Object.assign({}, DEFAULT_CONFIG, decoded);
    } catch(e) { return null; }
}

var KEYWORDS = ['manifest.json','stream','configure','api','play','test-ts'];

function parseUrl(reqUrl, host) {
    try {
        var url = new URL(reqUrl, 'http://' + host);
        var pathname = url.pathname;
        var parts = pathname.split('/').filter(Boolean);
        if (parts.length > 0 && KEYWORDS.indexOf(parts[0]) === -1) {
            var cfg = decodeConfig(parts[0]);
            if (cfg) return { userConfig: cfg, configStr: parts[0], rest: '/' + parts.slice(1).join('/') };
        }
        return { userConfig: null, configStr: null, rest: pathname };
    } catch (e) {
        return { userConfig: null, configStr: null, rest: reqUrl };
    }
}

function parseQuery(reqUrl, host) {
    try {
        var url = new URL(reqUrl, 'http://' + host);
        return Object.fromEntries(url.searchParams.entries());
    } catch (e) { return {}; }
}

function decodeUnicode(str) {
    try { return str.replace(/\\u[\dA-F]{4}/gi, function(m) { return String.fromCharCode(parseInt(m.replace(/\\u/g,''), 16)); }); }
    catch(e) { return str; }
}

function parseSize(sn) {
    if (!sn) return 0;
    var s = parseFloat(sn) || 0;
    var up = String(sn).toUpperCase();
    if (up.includes('GB') || up.includes('ГБ')) return s;
    if (up.includes('MB') || up.includes('МБ')) return s / 1024;
    if (s > 100) return s / 1024;
    return s;
}

function getPublicUrlFromReq(req) {
    var host  = req.headers['x-forwarded-host'] || req.headers['host'] || ('localhost:' + PORT);
    var proto = req.headers['x-forwarded-proto'] || 'http';
    if (host.indexOf('lhr.life') !== -1 || host.indexOf('localhost.run') !== -1) proto = 'https';
    if (host.indexOf('://') !== -1) return host.replace(/\/$/,'');
    return (proto + '://' + host).replace(/\/$/,'');
}

function buildTorrentioBase(cfg) {
    var opts = [];
    if (cfg.providers && cfg.providers.length) opts.push('providers=' + cfg.providers.join(','));
    opts.push('sort=' + (cfg.sortBy || 'size'));
    if (cfg.language) opts.push('language=' + cfg.language);
    if (cfg.qualityfilter && cfg.qualityfilter.length) opts.push('qualityfilter=' + cfg.qualityfilter.join(','));
    return 'https://torrentio.strem.fun/' + opts.join('|');
}

function buildManifest(cfg, configStr, pub) {
    return {
        id: 'com.hybrid.addon', version: '6.4.0', name: '🎬 Hybrid Addon',
        description: 'Torrentio + jac.red + Bitsearch/CSV → TorrServer | Made with love ❤️',
        resources: ['stream'], types: ['movie','series'],
        idPrefixes: ['tt'], behaviorHints: {
            configurable: true, configurationRequired: false,
            configurationURL: pub + (configStr ? '/'+configStr : '') + '/configure'
        }
    };
}

function getRuTitleFromTMDb(imdbId, type) {
    var cacheKey = imdbId + '_ru';
    if (TMDB_CACHE[cacheKey]) return Promise.resolve(TMDB_CACHE[cacheKey]);

    var metaType = (type === 'series') ? 'tv' : 'movie';

    return fetch('https://api.themoviedb.org/3/find/' + imdbId + '?api_key=' + TMDB_API_KEY + '&external_source=imdb_id', { timeout: 8000 })
    .then(function(r) { return r.ok ? r.json() : {}; })
    .then(function(data) {
        var results = data[metaType + '_results'] || [];
        if (results.length === 0) return null;
        var tmdbId = results[0].id;
        var releaseDate = results[0].release_date || results[0].first_air_date || '';
        var year = releaseDate ? releaseDate.substring(0, 4) : '';
        TMDB_CACHE[cacheKey + '_full'] = { year: year };

        return fetch('https://api.themoviedb.org/3/' + metaType + '/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=ru', { timeout: 8000 })
        .then(function(r) { return r.ok ? r.json() : {}; })
        .then(function(d) {
            var ruTitle = (d.title || d.name || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
            console.log('[TMDb] ' + imdbId + ' → RU:"' + ruTitle + '" (' + year + ')');
            TMDB_CACHE[cacheKey] = ruTitle || null;
            return ruTitle || null;
        });
    })
    .catch(function() { return null; });
}

var torrServerCache = {}, CACHE_TTL = 30 * 60 * 1000;

function getTorrServerFiles(tsUrl, magnet, title) {
    return fetch(tsUrl + '/torrents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', link: magnet, title: title, poster: '', save_to_db: false }), timeout: 15000 })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
        if (!data || !data.hash) return null;
        if (data.file_stats && data.file_stats.length > 0) return { hash: data.hash, files: data.file_stats };
        return new Promise(function(resolve) {
            var attempts = 0, maxAttempts = 6;
            function tryGet() {
                attempts++;
                setTimeout(function() {
                    fetch(tsUrl + '/torrents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get', hash: data.hash }), timeout: 10000 })
                    .then(function(r) { return r.ok ? r.json() : null; })
                    .then(function(d) {
                        if (d && d.file_stats && d.file_stats.length > 0) resolve({ hash: data.hash, files: d.file_stats });
                        else if (attempts < maxAttempts) tryGet();
                        else resolve({ hash: data.hash, files: [] });
                    })
                    .catch(function() { if (attempts < maxAttempts) tryGet(); else resolve({ hash: data.hash, files: [] }); });
                }, 3000);
            }
            tryGet();
        });
    })
    .catch(function() { return null; });
}

function getCachedFiles(ts, magnet, title) {
    var hashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/i);
    var cacheKey  = hashMatch ? hashMatch[1].toLowerCase() : null;
    if (cacheKey) {
        var cached = torrServerCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL)
            return Promise.resolve({ hash: cacheKey, files: cached.files });
    }
    return getTorrServerFiles(ts, magnet, title).then(function(result) {
        if (result && result.files.length > 0 && cacheKey)
            torrServerCache[cacheKey] = { files: result.files, timestamp: Date.now() };
        return result;
    });
}

function findAnimeEpisodeFile(files, season, episode) {
    if (!files || files.length === 0) return null;
    var s = String(season).padStart(2, '0');
    var videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.ts'];
    var allFiles = files.map(function(f, idx) { return Object.assign({}, f, { _realIndex: (f.id !== undefined && f.id !== null) ? Number(f.id) : idx }); });
    var videoFiles = allFiles.filter(function(f) { return videoExts.some(function(ex) { return (f.path || '').toLowerCase().endsWith(ex); }); });
    console.log('[Anime] 📂 Tổng video files: ' + videoFiles.length);
    var episodeFiles = videoFiles.filter(function(f) {
        var basename = (f.path || '').split('/').pop().toLowerCase();
        var path = (f.path || '').toLowerCase();
        var sizeMB = (f.length || 0) / (1024 * 1024);
        if (sizeMB < 500) { console.log('[Anime] ⏭️ Bỏ qua file nhỏ <500MB: ' + basename); return false; }
        var excludeKeywords = ['sample', 'trailer', 'opening', 'ending', 'preview', 'ncop', 'nced', 'creditless', 'menu', 'extra', 'bonus', 'sp', 'ova', 'special', 'ed ', ' op ', ' opening', ' ending', 'credit'];
        for (var i = 0; i < excludeKeywords.length; i++) { if (basename.indexOf(excludeKeywords[i]) !== -1 || path.indexOf(excludeKeywords[i]) !== -1) { console.log('[Anime] ⏭️ Bỏ qua file extra: ' + basename); return false; } }
        return true;
    });
    console.log('[Anime] 📂 Sau khi lọc: ' + episodeFiles.length + ' files');
    if (episodeFiles.length === 0) { console.log('[Anime] ❌ Không có file tập nào'); return null; }
    episodeFiles.sort(function(a, b) { return (a.path || '').localeCompare(b.path || ''); });
    if (episode > 0 && episode <= episodeFiles.length) {
        var selected = episodeFiles[episode - 1];
        console.log('[Anime] ✅ Chọn tập ' + episode + '/' + episodeFiles.length + ' → ' + (selected.path || ''));
        return selected;
    }
    console.log('[Anime] ❌ Tập ' + episode + ' vượt quá số file (' + episodeFiles.length + ')');
    return null;
}

function findEpisodeFile(files, season, episode) {
    if (!files || files.length === 0) return null;
    var s = String(season).padStart(2, '0'), sNum = String(season);
    var e = String(episode).padStart(2, '0'), eNum = String(episode);
    var videoExts = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.m4v', '.ts'];
    var allFiles = files.map(function(f, idx) { return Object.assign({}, f, { _realIndex: (f.id !== undefined && f.id !== null) ? Number(f.id) : idx }); });
    var videoFiles = allFiles.filter(function(f) { return videoExts.some(function(ex) { return (f.path || '').toLowerCase().endsWith(ex); }); });
    var hasCorrectSeason = videoFiles.some(function(f) { return f.season === season || f.season === String(season) || f.season === sNum || f.season === s; });
    var episodeFiles = videoFiles.filter(function(f) {
        var basename = (f.path || '').split('/').pop().toLowerCase();
        var path = (f.path || '').toLowerCase();
        var excludeKeywords = ['sample', 'trailer', 'opening', 'ending', 'preview', 'ncop', 'nced', 'creditless', 'menu', 'extra', 'bonus', 'sp', 'ova', 'special', 'ed ', ' op '];
        for (var i = 0; i < excludeKeywords.length; i++) { if (basename.indexOf(excludeKeywords[i]) !== -1 || path.indexOf(excludeKeywords[i]) !== -1) { console.log('[FindEp] ⏭️ Bỏ qua file extra: ' + basename); return false; } }
        return true;
    });
    console.log('[FindEp] 📂 Sau khi lọc extra: ' + episodeFiles.length + ' files (từ ' + videoFiles.length + ' files)');
    if (episodeFiles.length === 0) { console.log('[FindEp] ❌ Không có file tập nào'); return null; }
    for (var i = 0; i < episodeFiles.length; i++) {
        var f = episodeFiles[i];
        var fS = String(f.season !== undefined ? f.season : ''), fE = String(f.episode !== undefined ? f.episode : '');
        if (hasCorrectSeason) { if (fS !== '' && fE !== '' && (fS === sNum || fS === s) && (fE === eNum || fE === e)) { console.log('[FindEp] ✅ TS metadata: S' + s + 'E' + e + ' → id=' + f._realIndex + ' | ' + (f.path || '')); return f; } }
        else { console.log('[FindEp] ⚠️ Không có file nào season=' + season + ', bỏ qua kiểm tra season'); if (fE !== '' && (fE === eNum || fE === e)) { console.log('[FindEp] ✅ TS metadata (episode only): E' + e + ' → id=' + f._realIndex + ' | ' + (f.path || '')); return f; } }
    }
    for (var i = 0; i < episodeFiles.length; i++) {
        var basename = (episodeFiles[i].path || '').split('/').pop().toLowerCase();
        if (new RegExp('s0*' + season + 'e0*' + episode + '(?:\\D|$)').test(basename)) { console.log('[FindEp] ✅ SxxExx: S' + s + 'E' + e + ' → id=' + episodeFiles[i]._realIndex + ' | ' + (episodeFiles[i].path || '')); return episodeFiles[i]; }
        if (new RegExp('^0*' + episode + '[\\s\\.\\-_]').test(basename)) { console.log('[FindEp] ✅ Number prefix: S' + s + 'E' + e + ' → id=' + episodeFiles[i]._realIndex + ' | ' + (episodeFiles[i].path || '')); return episodeFiles[i]; }
        if (new RegExp('ep\\s*0*' + episode + '(?:\\D|$)', 'i').test(basename)) { console.log('[FindEp] ✅ "ep XX": S' + s + 'E' + e + ' → id=' + episodeFiles[i]._realIndex + ' | ' + (episodeFiles[i].path || '')); return episodeFiles[i]; }
    }
    var seasonPatterns = ['season_' + s, 'season_' + sNum, 'season ' + sNum, '/s' + s + '/', '/s' + sNum + '/', 'сезон_' + sNum, 'сезон ' + sNum];
    var seasonFiles = episodeFiles.filter(function(f) { var fp = (f.path || '').toLowerCase(); for (var i = 0; i < seasonPatterns.length; i++) { if (fp.indexOf(seasonPatterns[i]) !== -1) return true; } return new RegExp('s0*' + season + 'e').test(fp); });
    var targetFiles = seasonFiles.length > 0 ? seasonFiles : episodeFiles;
    targetFiles.sort(function(a, b) { return (a.path || '').localeCompare(b.path || ''); });
    if (episode > 0 && episode <= targetFiles.length) {
        var selected = targetFiles[episode - 1];
        console.log('[FindEp] ✅ COUNT: tập ' + episode + '/' + targetFiles.length + ' → id=' + selected._realIndex + ' | ' + (selected.path || ''));
        return selected;
    }
    console.log('[FindEp] ❌ Không tìm được tập ' + episode + ' (có ' + targetFiles.length + ' files)');
    return null;
}

function handlePlay(query, cfg, res) {
    var magnet = query.magnet || '', season = parseInt(query.s) || 0, episode = parseInt(query.e) || 0, title = query.title || 'video', ts = query.ts || cfg.torrServerUrl || '';
    if (ts && !ts.match(/^https?:\/\//)) ts = 'http://' + ts;
    if (!magnet || !ts) { res.writeHead(400); res.end('Missing magnet or ts'); return; }
    if (!season || !episode) { res.writeHead(302, { 'Location': ts + '/stream/' + encodeURIComponent(title) + '?link=' + encodeURIComponent(magnet) + '&index=0&play' }); res.end(); return; }
    getCachedFiles(ts, magnet, title).then(function(result) {
        if (!result || !result.files) { res.writeHead(404); res.end('Torrent not found'); return; }
        var found = cfg.animeMode ? findAnimeEpisodeFile(result.files, season, episode) : findEpisodeFile(result.files, season, episode);
        if (found) { res.writeHead(302, { 'Location': ts + '/stream/' + encodeURIComponent(title) + '?link=' + result.hash + '&index=' + found._realIndex + '&play' }); res.end(); }
        else { res.writeHead(404); res.end('Episode S' + season + 'E' + episode + ' not found'); }
    }).catch(function(e) { res.writeHead(500); res.end('Error'); });
}
function searchJacred(imdbId, type, maxResults, sortBy, apiUrl) {
    return getRuTitleFromTMDb(imdbId, type).then(function(ruTitle) {
        var cacheKey = imdbId + '_ru';
        var tmdbData = TMDB_CACHE[cacheKey + '_full'] || {};
        var expectedYear = tmdbData.year || '';
        var seen = new Map(), unique = [];
        function addResults(arr, sourceName) {
            if (!arr || !arr.length) return 0;
            var newCount = 0;
            for (var i = 0; i < arr.length; i++) {
                var t = arr[i];
                if (!t.magnet) continue;
                var hashMatch = t.magnet.match(/btih:([a-fA-F0-9]{40})/i);
                var key = hashMatch ? hashMatch[1].toLowerCase() : t.magnet;
                if (!seen.has(key)) {
                    var types = t.types || [], seasons = t.seasons || [], yearNum = parseInt(t.released || t.related || '0') || 0;
                    if (type === 'movie' && (types.includes('series') || seasons.length > 0)) continue;
                    if (type === 'series' && types.includes('movie') && seasons.length === 0) continue;
                    if (expectedYear && yearNum > 0 && Math.abs(yearNum - parseInt(expectedYear)) > 2) continue;
                    seen.set(key, true);
                    var qualityText = ''; if (t.quality === 2160) qualityText = '4K'; else if (t.quality === 1080) qualityText = '1080p'; else if (t.quality === 720) qualityText = '720p'; else if (t.quality === 480) qualityText = '480p'; else if (t.quality) qualityText = t.quality + 'p';
                    var videoType = ''; if (t.videotype) { var vt = t.videotype.toLowerCase(); if (vt.includes('hdr') || vt.includes('dolby')) videoType = 'HDR'; else if (vt.includes('sdr')) videoType = 'SDR'; }
                    var audio = ''; if (t.voice && Array.isArray(t.voice) && t.voice.length > 0) audio = t.voice.filter(function(v){return v;}).join('/');
                    unique.push({ original: t, title: decodeUnicode(t.title || ''), sizeGB: parseSize(t.sizeName || t.size), date: t.createdTime ? new Date(t.createdTime).getTime() : 0, sid: t.sid || t.seeds || t.seeders || 0, tracker: t.tracker || 'Unknown', magnet: t.magnet, quality: qualityText, videoType: videoType, audio: audio, year: yearNum });
                    newCount++;
                }
            }
            console.log('[jac.red] ' + sourceName + ' → ' + (arr.length) + ' kết quả, +' + newCount + ' unique');
            return newCount;
        }
        var promises = [];
        if (ruTitle) promises.push(fetch(apiUrl + '?search=' + encodeURIComponent(ruTitle), { timeout: 10000 }).then(function(r) { return r.ok ? r.json() : []; }).catch(function() { return []; }).then(function(arr) { addResults(arr, 'RU "' + ruTitle + '"'); }));
        promises.push(fetch(apiUrl + '?search=' + encodeURIComponent(imdbId), { timeout: 10000 }).then(function(r) { return r.ok ? r.json() : []; }).catch(function() { return []; }).then(function(arr) { addResults(arr, 'IMDb "' + imdbId + '"'); }));
        return Promise.all(promises).then(function() {
            console.log('[jac.red] ✅ Tổng unique: ' + unique.length);
            if (unique.length === 0) return [];
            unique.sort(function(a, b) { if (sortBy === 'seeds') return b.sid - a.sid; if (sortBy === 'date') return b.date - a.date; return b.sizeGB - a.sizeGB; });
            return unique.slice(0, maxResults || 30);
        });
    });
}

function handleStream(type, id, cfg, res, pub) {
    var ts = cfg.torrServerUrl || ''; if (ts && !ts.match(/^https?:\/\//)) ts = 'http://' + ts;
    var idClean = decodeURIComponent(id), parts = idClean.split(':'), imdbId = parts[0], season = parseInt(parts[1]) || 0, episode = parseInt(parts[2]) || 0;
    var streams = [], completed = 0, total = (cfg.jacredEnabled ? 1 : 0) + (cfg.torrentioEnabled ? 1 : 0) + (cfg.bitsearchEnabled ? 1 : 0);
    if (!total) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ streams: [] })); return; }
    function sendResponse() { if (++completed >= total) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ streams: streams })); } }

    var commonSort = cfg.commonSortBy || 'size';

    // ========== NGUỒN 2: BITSEARCH + TORRENT CSV ==========
    if (cfg.bitsearchEnabled) {
        var metaType = (type === 'series') ? 'tv' : 'movie';
        fetch('https://api.themoviedb.org/3/find/' + imdbId + '?api_key=' + TMDB_API_KEY + '&external_source=imdb_id', { timeout: 8000 })
        .then(function(r) { return r.ok ? r.json() : {}; })
        .then(function(data) {
            var results = data[metaType + '_results'] || [];
            var originalTitle = (results[0] && (results[0].title || results[0].name)) || '';
            var year = (results[0] && (results[0].release_date || results[0].first_air_date || '').substring(0,4)) || '';
            var query = originalTitle;
            if (year) query += ' ' + year;
            if (!query || query === ' ') query = imdbId;
            console.log('[Nguồn 2] Search: "' + query + '"');
            return searchBitsearchAndCsv(query, cfg.maxResults || 30);
        }).catch(function() { return searchBitsearchAndCsv(imdbId, cfg.maxResults || 30); })
        .then(function(results) {
            // ========== SẮP XẾP THEO commonSort ==========
            if (commonSort === 'seeds') {
                results.sort(function(a, b) { return b.seeds - a.seeds; });
            } else if (commonSort === 'date') {
                results.sort(function(a, b) { return (b.date || 0) - (a.date || 0); });
            } else {
                results.sort(function(a, b) { return b.sizeGB - a.sizeGB; });
            }
            
            results.forEach(function(t) {
                if (!t.magnet) return;
                
                var title = t.title;
                
                var episodeMatch = title.match(/\bS(\d{1,2})\s*E(\d{1,2})\b/i);
                var isSingleEpisode = episodeMatch !== null;
                var isPack = !isSingleEpisode;
                
                if (isSingleEpisode && type === 'series' && season > 0 && episode > 0) {
                    var torrentSeason = parseInt(episodeMatch[1]);
                    var torrentEpisode = parseInt(episodeMatch[2]);
                    if (torrentSeason !== season || torrentEpisode !== episode) {
                        console.log('[Nguồn 2] ⏭️ Bỏ qua tập lẻ S' + torrentSeason + 'E' + torrentEpisode);
                        return;
                    }
                }
                
                // Lọc season cho PACK nguồn 2
                if (isPack && type === 'series' && season > 0) {
                    var sPad = String(season).padStart(2, '0');
                    var seasonPattern = new RegExp('S' + sPad + '(?:[^\\d]|$)|Season\\s*' + season + '(?:[^\\d]|$)|第\\s*' + season + '\\s*季|S' + season + '(?:[^\\d]|$)', 'i');
                    var otherSeasonPattern = /S\d{1,2}(?:[^\d]|$)|Season\s*\d|第\s*\d+\s*季/gi;
                    
                    var hasOtherSeason = false;
                    var matches = title.match(otherSeasonPattern);
                    if (matches) {
                        for (var i = 0; i < matches.length; i++) {
                            var m = matches[i];
                            if (!seasonPattern.test(m)) {
                                var otherSeasonMatch = m.match(/\d+/);
                                if (otherSeasonMatch && parseInt(otherSeasonMatch[0]) !== season) {
                                    hasOtherSeason = true;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (hasOtherSeason) {
                        console.log('[Nguồn 2] ⏭️ Bỏ qua PACK có season khác');
                        return;
                    }
                }
                
                var sizeGB = t.sizeGB.toFixed(2);
                var streamName = '🟢 ' + t.tracker;
                var badge = isPack ? '📦 PACK | ' : '🎬 TẬP LẺ | ';
                var displayTitle = badge + title + '\n' + sizeGB + 'GB | 🟢 ' + t.seeds + '\n📡 Nguồn: ' + t.tracker;
                
                if (type === 'movie') {
                    streams.push({ name: streamName, title: displayTitle, url: ts + '/stream/' + encodeURIComponent(title) + '?link=' + encodeURIComponent(t.magnet) + '&index=0&play', behaviorHints: { notWebReady: true, bingeGroup: t.source + '-' + idClean } });
                } else {
                    var url = isPack 
                        ? pub + '/play?magnet=' + encodeURIComponent(t.magnet) + '&s=' + season + '&e=' + episode + '&title=' + encodeURIComponent(title) + '&ts=' + encodeURIComponent(ts)
                        : ts + '/stream/' + encodeURIComponent(title) + '?link=' + encodeURIComponent(t.magnet) + '&index=0&play';
                    streams.push({ name: streamName, title: displayTitle, url: url, behaviorHints: { notWebReady: true, bingeGroup: t.source + '-' + idClean } });
                }
            });
            sendResponse();
        }).catch(function() { sendResponse(); });
    }

    // ========== NGUỒN 1: JAC.RED ==========
    if (cfg.jacredEnabled) {
        var apiUrl = JAC_RED_DOMAINS[cfg.jacredDomain] || JAC_RED_DOMAINS[DEFAULT_JACRED_DOMAIN];
        searchJacred(imdbId, type, cfg.maxResults || 30, commonSort, apiUrl).then(function(results) {
            results.forEach(function(t) {
                if (!t.magnet) return;
                
                var title = t.title;
                
                // ========== LỌC SEASON CHO NGUỒN 1 ==========
                if (type === 'series' && season > 0) {
                    var sPad = String(season).padStart(2, '0');
                    
                    var completePackPattern = /S\d{1,2}[-~]S?\d{1,2}|Season\s*\d+\s*[-~]\s*\d+|сезон[ы]?\s*\d+\s*[-~]\s*\d+|Complete|Полный|Все\s*сезон[ы]?|1-\d+\s*сезон/i;
                    var isCompletePack = completePackPattern.test(title);
                    
                    if (!isCompletePack) {
                        var singleSeasonPattern = new RegExp('S' + sPad + '(?:[^\\d]|$)|Season\\s*' + season + '(?:[^\\d]|$)|сезон\\s*' + season + '(?:[^\\d]|$)|' + season + '\\s*сезон', 'i');
                        var otherSeasonPattern = /S\d{1,2}(?:[^\d]|$)|Season\s*\d|сезон\s*\d|\d+\s*сезон/gi;
                        
                        var hasOtherSeason = false;
                        var matches = title.match(otherSeasonPattern);
                        if (matches) {
                            for (var i = 0; i < matches.length; i++) {
                                var m = matches[i];
                                if (!singleSeasonPattern.test(m)) {
                                    var otherSeasonMatch = m.match(/\d+/);
                                    if (otherSeasonMatch && parseInt(otherSeasonMatch[0]) !== season) {
                                        hasOtherSeason = true;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        if (hasOtherSeason) {
                            console.log('[jac.red] ⏭️ Bỏ qua PACK từng season khác: ' + title);
                            return;
                        }
                        
                        if (!singleSeasonPattern.test(title) && /S\d{1,2}|Season\s*\d|сезон\s*\d/.test(title)) {
                            console.log('[jac.red] ⏭️ Bỏ qua PACK không rõ season: ' + title);
                            return;
                        }
                    } else {
                        console.log('[jac.red] 📦 PACK TRỌN BỘ: ' + title);
                    }
                }
                
                var trackerDisplay = t.tracker.charAt(0).toUpperCase() + t.tracker.slice(1);
                var sizeGB = t.sizeGB.toFixed(2), seeds = t.sid, quality = t.quality || '', videoType = t.videoType || '', audio = t.audio || '';
                var streamName = '🔴 ' + trackerDisplay, streamTitle = t.title + '\n' + sizeGB + 'GB | 🟢 ' + seeds;
                if (quality) { streamTitle += ' | 🎬 ' + quality; if (videoType) streamTitle += ' ' + videoType; }
                if (audio) streamTitle += ' | 🔊 ' + audio;
                streamTitle += '\n📡 Nguồn: ' + trackerDisplay;
                if (type === 'movie') streams.push({ name: streamName, title: streamTitle, url: ts + '/stream/' + encodeURIComponent(t.title) + '?link=' + encodeURIComponent(t.magnet) + '&index=0&play', behaviorHints: { notWebReady: true, bingeGroup: 'jacred-' + idClean } });
                else streams.push({ name: streamName, title: streamTitle, url: pub + '/play?magnet=' + encodeURIComponent(t.magnet) + '&s=' + season + '&e=' + episode + '&title=' + encodeURIComponent(t.title) + '&ts=' + encodeURIComponent(ts), behaviorHints: { notWebReady: true, bingeGroup: 'jacred-' + idClean } });
            });
            sendResponse();
        }).catch(function(e) { console.error('[jac.red]', e.message); sendResponse(); });
    }

    // ========== TORRENTIO ==========
    if (cfg.torrentioEnabled) {
        var tioUrl = buildTorrentioBase(cfg) + '/stream/' + type + '/' + idClean + '.json';
        fetch(tioUrl, { timeout: 15000 }).then(function(r) { return r.ok ? r.json() : { streams: [] }; }).then(function(data) {
            if (data.streams) data.streams.filter(function(s) { return s.infoHash; }).forEach(function(s) { streams.push({ name: '🔗 TorrServer', title: '🎬 ' + s.title, url: ts + '/stream/' + encodeURIComponent(s.title || 'video') + '?link=' + s.infoHash + '&index=' + (s.fileIdx || 0) + '&play', behaviorHints: { notWebReady: true, bingeGroup: 'torrentio-' + s.infoHash } }); });
            console.log('[Torrentio] +' + (data.streams ? data.streams.length : 0));
            sendResponse();
        }).catch(function(e) { console.error('[Torrentio]', e.message); sendResponse(); });
    }
}
function buildConfigPage(cfg, configStr, pub) {
    var installUrl = pub + (configStr ? '/' + configStr : '') + '/manifest.json';
    var stremioUrl = 'stremio://' + installUrl.replace(/^https?:\/\//, '');
    var githubLink = 'https://github.com/nguyenquocngu93/Hybrid-';
    var css = '*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0f0f1a;color:#e0e0e0;min-height:100vh;padding:20px}.wrap{max-width:600px;margin:0 auto}h1{text-align:center;font-size:28px;padding:20px 0;background:linear-gradient(135deg,#667eea,#764ba2);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.card{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:16px;padding:20px;margin-bottom:16px}.card h2{font-size:14px;color:#667eea;margin-bottom:16px}.fg{margin-bottom:16px}.fg label{display:block;color:#888;font-size:12px;margin-bottom:6px;text-transform:uppercase}input,textarea,select{width:100%;padding:12px;background:#0f0f1a;border:1px solid #3a3a5a;border-radius:8px;color:#e0e0e0;font-size:14px}textarea{resize:vertical;min-height:70px;font-family:monospace}.btn{padding:12px 20px;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;transition:all .2s;background:#2a2a4a;color:#ccc}.btn-p{background:linear-gradient(135deg,#11998e,#38ef7d);color:#000}.btn-b{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;width:100%}.btn-test{margin-left:8px;padding:8px 16px;font-size:12px;background:#2a2a4a;color:#ccc;border-radius:6px;white-space:nowrap}.brow{display:flex;gap:8px}.ubox{background:#0a0a15;border:1px solid #333;border-radius:8px;padding:12px;font-family:monospace;font-size:12px;color:#a0a0ff;word-break:break-all;margin:16px 0}.trow{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #222}.trow:last-child{border:none}.trow .ti span{font-size:14px;color:#ccc}.sw{position:relative;width:44px;height:24px}.sw input{opacity:0;width:0;height:0}.sl{position:absolute;inset:0;background:#333;border-radius:24px;cursor:pointer;transition:.3s}.sl:before{content:"";position:absolute;width:18px;height:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.3s}input:checked+.sl{background:#667eea}input:checked+.sl:before{transform:translateX(20px)}.sort-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}.sort-btn{padding:12px 8px;background:#0f0f1a;border:2px solid #2a2a4a;border-radius:10px;color:#aaa;font-size:12px;font-weight:600;cursor:pointer;text-align:center;transition:all .2s}.sort-btn.active{border-color:#667eea;background:#1a1a3e;color:#fff}.footer{text-align:center;margin-top:30px;padding:20px;color:#555;font-size:14px;border-top:1px solid #2a2a4a}.footer i{color:#ff6b6b}.guide{background:#0a0a15;border-radius:12px;padding:16px;margin-top:20px}.guide h3{color:#667eea;font-size:14px;margin-bottom:12px}.guide p{color:#aaa;font-size:13px;margin-bottom:8px;line-height:1.5}.guide code{background:#0f0f1a;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:11px;color:#38ef7d}.step{margin-bottom:12px;padding-left:20px;position:relative}.step:before{content:"▹";position:absolute;left:0;color:#667eea}.info-box{background:#1a1a3e;border-left:4px solid #667eea;padding:12px;border-radius:8px;margin-bottom:16px}.info-box p{color:#ccc;font-size:12px;line-height:1.5;margin-bottom:4px}.info-box strong{color:#fff}.ts-test-result{margin-top:8px;padding:8px 12px;border-radius:6px;font-size:12px;display:none}.ts-test-result.success{background:#0a3a0a;color:#38ef7d;border:1px solid #11998e}.ts-test-result.error{background:#3a0a0a;color:#ff6b6b;border:1px solid #ff4444}.ts-test-result.loading{background:#2a2a4a;color:#a0a0ff}';
    var commonSort = cfg.commonSortBy || 'size';
    var jacredDomain = cfg.jacredDomain || DEFAULT_JACRED_DOMAIN;
    var domainOptions = '';
    for (var key in JAC_RED_DOMAINS) domainOptions += '<option value="' + key + '"' + (jacredDomain === key ? ' selected' : '') + '>' + key + '</option>';
    return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hybrid Addon</title><style>' + css + '</style></head><body><div class="wrap"><h1>🎬 Hybrid Addon v6.4.0</h1><div class="card"><h2>📋 Link Config Torrentio</h2><div class="fg"><label>Dán link config</label><textarea id="configLink" placeholder="https://torrentio.strem.fun/..."></textarea></div><button class="btn" style="width:100%;margin-bottom:8px" onclick="applyTorrentioConfig()">⚡ Áp dụng</button><button class="btn" style="width:100%" onclick="resetTorrentioConfig()">🔄 Reset</button></div><div class="card"><h2>🟢 Torrentio</h2><div class="trow"><div class="ti"><span>🟢 Bật Torrentio</span></div><label class="sw"><input type="checkbox" id="torrentioEnabled"' + (cfg.torrentioEnabled ? ' checked' : '') + '><span class="sl"></span></label></div></div><div class="card"><h2>🟡 Bitsearch + TorrentCSV</h2><div class="info-box"><p><strong>🔍 Bitsearch</strong> - Công cụ tìm kiếm torrent DHT, tìm torrent từ mạng phân tán.</p><p><strong>📊 TorrentCSV</strong> - Kho dữ liệu torrent tổng hợp từ nhiều nguồn, cập nhật liên tục.</p></div><div class="trow"><div class="ti"><span>🟡 Bật Bitsearch + CSV</span></div><label class="sw"><input type="checkbox" id="bitsearchEnabled"' + (cfg.bitsearchEnabled ? ' checked' : '') + '><span class="sl"></span></label></div></div><div class="card"><h2>🖥️ TorrServer</h2><div class="fg"><label>URL</label><div style="display:flex;align-items:center"><input type="text" id="tsUrl" value="' + (cfg.torrServerUrl || '') + '" placeholder="http://192.168.1.100:8090" style="flex:1"><button class="btn btn-test" onclick="testTorrServer()">🔌 Test</button></div><div id="tsTestResult" class="ts-test-result"></div><p class="hint" style="color:#aaa;font-size:13px;margin-top:4px"><strong>🖥️ TorrServer</strong> - Xem torrent online không cần tải. <a href="https://github.com/YouROK/TorrServer" target="_blank" style="color:#667eea;">Tải TorrServer</a> · Cần điền đúng IP:Port</p></div></div><div class="card"><h2>🔴 jac.red Settings</h2><div class="info-box"><p><strong>📡 jac.red</strong> - Công cụ tìm kiếm torrent Nga, hỗ trợ tiếng Nga, tìm phim lẻ và phim bộ chất lượng cao từ các tracker: RuTracker, KinoZal, NNMClub, Toloka, RuTor...</p><p><strong>🌐 Domain:</strong> Nếu một domain không truy cập được, hãy chọn domain khác.</p></div><div class="trow"><div class="ti"><span>🔴 Bật jac.red</span></div><label class="sw"><input type="checkbox" id="jacredEnabled"' + (cfg.jacredEnabled ? ' checked' : '') + '><span class="sl"></span></label></div><div class="fg"><label>Domain jac.red</label><select id="jacredDomain">' + domainOptions + '</select><p class="hint" style="color:#555;font-size:11px;margin-top:4px">🔥 jac.red, jac-red.ru, jr.maxvol.pro, ru.jacred.pro, jacred.stream</p></div></div><div class="card"><h2>⚙️ Bộ lọc chung (jac.red, Bitsearch, CSV)</h2><div class="info-box"><p><strong>🔧 Cài đặt chung</strong> - Áp dụng cho jac.red, Bitsearch và TorrentCSV. Torrentio có cấu hình riêng.</p></div><div class="fg"><label>Sắp xếp kết quả</label><div class="sort-grid"><div class="sort-btn' + (commonSort === 'size' ? ' active' : '') + '" onclick="setCommonSort(\'size\',this)">💾 Dung Lượng</div><div class="sort-btn' + (commonSort === 'seeds' ? ' active' : '') + '" onclick="setCommonSort(\'seeds\',this)">👥 Seeds</div><div class="sort-btn' + (commonSort === 'date' ? ' active' : '') + '" onclick="setCommonSort(\'date\',this)">📅 Mới Nhất</div></div><input type="hidden" id="commonSort" value="' + commonSort + '"></div><div class="fg"><label>Số kết quả tối đa</label><input type="number" id="maxResults" value="' + (cfg.maxResults || 30) + '" min="5" max="100"></div><div class="fg"><label>🚫 Loại trừ độ phân giải</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"><label style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#0f0f1a;border:1px solid #2a2a4a;border-radius:6px;cursor:pointer"><input type="checkbox" value="480p" ' + (cfg.commonQualityFilter && cfg.commonQualityFilter.includes('480p') ? 'checked' : '') + '> 480p</label><label style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#0f0f1a;border:1px solid #2a2a4a;border-radius:6px;cursor:pointer"><input type="checkbox" value="720p" ' + (cfg.commonQualityFilter && cfg.commonQualityFilter.includes('720p') ? 'checked' : '') + '> 720p</label><label style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#0f0f1a;border:1px solid #2a2a4a;border-radius:6px;cursor:pointer"><input type="checkbox" value="1080p" ' + (cfg.commonQualityFilter && cfg.commonQualityFilter.includes('1080p') ? 'checked' : '') + '> 1080p</label><label style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:#0f0f1a;border:1px solid #2a2a4a;border-radius:6px;cursor:pointer"><input type="checkbox" value="4K" ' + (cfg.commonQualityFilter && cfg.commonQualityFilter.includes('4K') ? 'checked' : '') + '> 4K</label></div><p class="hint" style="color:#555;font-size:11px;margin-top:4px">Tick để ẩn các torrent có độ phân giải tương ứng</p></div></div><div class="card"><h2>🎌 Anime Mode</h2><div class="info-box"><p><strong>🎌 Anime Mode</strong> - Dành cho pack anime bị TorrServer parse sai metadata. Sẽ lọc file <500MB, bỏ qua OP/ED, và đếm file theo thứ tự.</p></div><div class="trow"><div class="ti"><span>🎌 Bật Anime Mode</span><small>Bật khi xem anime bị chọn sai tập</small></div><label class="sw"><input type="checkbox" id="animeMode"' + (cfg.animeMode ? ' checked' : '') + '><span class="sl"></span></label></div></div><div class="card"><h2>📦 Link Cài Đặt</h2><div class="ubox" id="iurl">' + installUrl + '</div><div class="brow"><button class="btn" onclick="copyUrl()" style="flex:1">📋 Copy</button><a class="btn btn-p" href="' + stremioUrl + '" id="slink" style="flex:2">▶ Cài Vào Stremio</a></div></div><div class="card"><h2>📖 Mô Tả & GitHub</h2><div class="fg"><label>Dự án</label><p style="color:#aaa;font-size:13px;margin-bottom:10px">🎬 Hybrid Addon - Tổng hợp nguồn phim từ Torrentio, jac.red, Bitsearch, TorrentCSV, phát qua TorrServer. Hỗ trợ phim lẻ và phim bộ với chọn tập thông minh.</p><a href="' + githubLink + '" target="_blank" class="btn" style="display:inline-flex;width:auto;background:#24243e">🐙 GitHub Repository</a></div></div><button class="btn btn-b" onclick="gen()">🔗 Tạo Link</button><div class="guide"><h3>📖 Hướng Dẫn Sử Dụng</h3><div class="step"><strong>1. Cấu hình Addon</strong><br/>- Nhập URL TorrServer và bấm Test để kiểm tra<br/>- Bật/tắt nguồn jac.red, Torrentio, Bitsearch/CSV<br/>- Chọn domain jac.red (nếu domain chính bị chặn)<br/>- Có thể dán link config Torrentio để tùy chỉnh nguồn</div><div class="step"><strong>2. Bộ lọc chung</strong><br/>- Chọn cách sắp xếp (dung lượng, seeds, mới nhất)<br/>- Giới hạn số kết quả<br/>- Loại trừ độ phân giải không mong muốn</div><div class="step"><strong>3. Anime Mode</strong><br/>- Bật khi xem anime bị chọn sai tập</div><div class="step"><strong>4. Tạo link & Cài đặt</strong><br/>- Nhấn "Tạo Link" sau khi cấu hình<br/>- Copy link hoặc nhấn "Cài Vào Stremio"</div><div class="step"><strong>5. Sử dụng</strong><br/>- Tìm phim bất kỳ trong Stremio<br/>- Chọn stream từ "Hybrid Addon"</div><div class="step"><strong>⚠️ Lưu ý</strong><br/>- Cần có kết nối mạng ổn định<br/>- TorrServer nên đặt gần để giảm độ trễ</div></div><div class="footer">Made with <i>❤️</i> love | v6.4.0</div></div><script>var currentConfig=' + JSON.stringify({ providers: cfg.providers, sortBy: cfg.sortBy, language: cfg.language, qualityfilter: cfg.qualityfilter }) + ';function setCommonSort(v,el){document.getElementById("commonSort").value=v;document.querySelectorAll(".sort-btn").forEach(b=>b.classList.remove("active"));el.classList.add("active")}function enc(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=/g,"")}function parseTorrentioLink(link){try{var u=new URL(link.replace("stremio://","https://"));var m=u.pathname.match(/\\/([^\\/]+)\\/manifest\\.json/);if(!m)return null;var p=m[1].split("|");var c={providers:[],sortBy:"size",language:"",qualityfilter:[]};p.forEach(x=>{var[k,v]=x.split("=");if(k==="providers")c.providers=v.split(",");else if(k==="sort")c.sortBy=v;else if(k==="language")c.language=v;else if(k==="qualityfilter")c.qualityfilter=v.split(",")});return c}catch(e){return null}}function applyTorrentioConfig(){var l=document.getElementById("configLink").value.trim();if(!l)return alert("Dán link!");var c=parseTorrentioLink(l);if(!c)return alert("Link lỗi!");currentConfig=c;gen()}function resetTorrentioConfig(){currentConfig=' + JSON.stringify(DEFAULT_TORRENTIO_CONFIG) + ';document.getElementById("configLink").value="";gen()}function getCurrentConfig(){return Object.assign({torrServerUrl:document.getElementById("tsUrl").value.trim(),jacredEnabled:document.getElementById("jacredEnabled").checked,torrentioEnabled:document.getElementById("torrentioEnabled").checked,bitsearchEnabled:document.getElementById("bitsearchEnabled").checked,commonSortBy:document.getElementById("commonSort").value,maxResults:parseInt(document.getElementById("maxResults").value)||30,jacredDomain:document.getElementById("jacredDomain").value,animeMode:document.getElementById("animeMode").checked,commonQualityFilter:Array.from(document.querySelectorAll(\'.card input[type=checkbox]:checked\')).map(c=>c.value)},currentConfig)}function copyUrl(){var url=document.getElementById("iurl").textContent;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(function(){alert("✅ Đã copy link thành công!");}).catch(function(){fallbackCopy(url);});}else{fallbackCopy(url);}}function fallbackCopy(text){var textarea=document.createElement("textarea");textarea.value=text;textarea.style.position="fixed";textarea.style.top="-9999px";textarea.style.left="-9999px";document.body.appendChild(textarea);textarea.select();try{document.execCommand("copy");alert("✅ Đã copy link thành công!");}catch(err){alert("❌ Copy thất bại, vui lòng copy thủ công: "+text);}document.body.removeChild(textarea);}function gen(){var c=getCurrentConfig();var e=enc(c);var u=location.protocol+"//"+location.host+"/"+e+"/manifest.json";document.getElementById("iurl").textContent=u;document.getElementById("slink").href="stremio://"+u.replace(/^https?:\\/\\//,"")}async function testTorrServer(){var url=document.getElementById("tsUrl").value.trim();var resultDiv=document.getElementById("tsTestResult");if(!url){resultDiv.className="ts-test-result error";resultDiv.style.display="block";resultDiv.textContent="❌ Vui lòng nhập URL TorrServer";return;}if(!url.match(/^https?:\\/\\//)){url="http://"+url;}resultDiv.className="ts-test-result loading";resultDiv.style.display="block";resultDiv.textContent="⏳ Đang kiểm tra...";try{var controller=new AbortController();var timeoutId=setTimeout(function(){controller.abort()},8000);var response=await fetch(url+"/echo",{method:"GET",signal:controller.signal});clearTimeout(timeoutId);if(response.ok){var text=await response.text();resultDiv.className="ts-test-result success";resultDiv.style.display="block";resultDiv.textContent="✅ Kết nối thành công! TorrServer đang hoạt động.";}else{throw new Error("HTTP "+response.status);}}catch(error){resultDiv.className="ts-test-result error";resultDiv.style.display="block";if(error.name==="AbortError"){resultDiv.textContent="❌ Timeout: Không thể kết nối đến TorrServer (sau 8 giây)";}else{resultDiv.textContent="❌ Lỗi kết nối: "+error.message;}}}</script></body></html>';
}

var server = http.createServer(function(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    var host = req.headers['host'] || 'localhost';
    var p = parseUrl(req.url, host), cfg = p.userConfig || DEFAULT_CONFIG, rest = p.rest, pub = getPublicUrlFromReq(req), query = parseQuery(req.url, host);
    console.log('[REQ] ' + req.url);
    if (rest === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (rest === '/play') { handlePlay(query, cfg, res); return; }
    if (rest === '/' || rest === '/configure') { res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' }); res.end(buildConfigPage(cfg, p.configStr, pub)); return; }
    if (rest === '/manifest.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(buildManifest(cfg, p.configStr, pub))); return; }
    if (rest.indexOf('/stream/') === 0) { var parts = rest.split('/').filter(Boolean); if(parts[1] && parts[2]) handleStream(parts[1], parts[2].replace('.json', ''), cfg, res, pub); else { res.writeHead(404); res.end(); } return; }
    res.writeHead(404); res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', function() {
    console.log('\n✅ Hybrid Addon v6.4.0: http://localhost:' + PORT);
    console.log('⚙️  Configure: http://localhost:' + PORT + '/configure');
    console.log('🎌 Anime Mode: ' + (DEFAULT_CONFIG.animeMode ? 'ON' : 'OFF'));
    console.log('🟡 Bitsearch+CSV: ' + (DEFAULT_CONFIG.bitsearchEnabled ? 'ON' : 'OFF'));
    console.log('⚙️  Bộ lọc chung: ' + (DEFAULT_CONFIG.commonSortBy || 'size'));
    console.log('❤️  Made with love\n');
});
