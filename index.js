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
      });    })
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
  providers: ['yts', 'eztv', 'rarbg', '1337x', 'thepiratebay', 'kickasstorrents', 'torrentgalaxy', 'magnetdl', 'horriblesubs', 'nyaasi', 'tokyotosho', 'anidex', 'nekobt', 'rutor', 'rutracker', 'torrent9', 'ilcorsaronero', 'mejortorrent', 'wolfmax4k', 'cinecalidad', 'besttorrents'],
  sortBy: 'size',
  language: 'russian,ukrainian',
  qualityfilter: ['480p']
};
var DEFAULT_CONFIG = Object.assign({
  torrServerUrl: '',
  jacredEnabled: true,
  torrentioEnabled: true,
  bitsearchEnabled: true,
  maxResults: 30,
  jacredDomain: DEFAULT_JACRED_DOMAIN,
  animeMode: false,
  commonSortBy: 'size',
  commonQualityFilter: [], minSize: 0, maxSize: 1000, minSize: 0, maxSize: 1000
}, DEFAULT_TORRENTIO_CONFIG);
function decodeConfig(str) {
  try {
    var cleanStr = str.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/manifest.json$/, '').replace(/\/configure$/, '');    var configPart = cleanStr.split('/')[0];
    if (!configPart) return null;
    var b64 = configPart.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var decoded = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return Object.assign({}, DEFAULT_CONFIG, decoded);
  } catch(e) { return null; }
}
var KEYWORDS = ['manifest.json', 'stream', 'configure', 'api', 'play', 'test-ts'];
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
  try { return str.replace(/\u[\dA-F]{4}/gi, function(m) { return String.fromCharCode(parseInt(m.replace(/\u/g, ''), 16)); }); }
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
  var host = req.headers['x-forwarded-host'] || req.headers['host'] || ('localhost:' + PORT);
  var proto = req.headers['x-forwarded-proto'] || 'http';
  if (host.indexOf('lhr.life') !== -1 || host.indexOf('localhost.run') !== -1) proto = 'https';
  if (host.indexOf('://') !== -1) return host.replace(/\/$/, '');
  return (proto + '://' + host).replace(/\/$/, '');
}
function buildTorrentioBase(cfg) {  var opts = [];
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
    resources: ['stream'], types: ['movie', 'series'],
    idPrefixes: ['tt'], behaviorHints: {
      configurable: true, configurationRequired: false,
      configurationURL: pub + (configStr ? '/' + configStr : '') + '/configure'
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
      if (!data || !data.hash) return null;      if (data.file_stats && data.file_stats.length > 0) return { hash: data.hash, files: data.file_stats };
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
  var cacheKey = hashMatch ? hashMatch[1].toLowerCase() : null;
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
    return true;  });
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
    if (new RegExp('ep\\s0*' + episode + '(?:\\D|$)', 'i').test(basename)) { console.log('[FindEp] ✅ "ep XX ": S' + s + 'E' + e + ' → id=' + episodeFiles[i]._realIndex + ' | ' + (episodeFiles[i].path || '')); return episodeFiles[i]; }
  }
  var seasonPatterns = ['season_' + s, 'season_' + sNum, 'season ' + sNum, '/s' + s + '/', '/s' + sNum + '/', 'сезон_' + sNum, 'сезон ' + sNum];
  var seasonFiles = episodeFiles.filter(function(f) { var fp = (f.path || '').toLowerCase(); for (var i = 0; i < seasonPatterns.length; i++) { if (fp.indexOf(seasonPatterns[i]) !== -1) return true; } return new RegExp('s0*' + season + 'e').test(fp); });
  var targetFiles = seasonFiles.length > 0 ? seasonFiles : episodeFiles;
  targetFiles.sort(function(a, b) { return (a.path || '').localeCompare(b.path || ''); });
  if (episode > 0 && episode <= targetFiles.length) {
    var selected = targetFiles[episode - 1];
    console.log('[FindEp] ✅ COUNT: tập ' + episode + '/' + targetFiles.length + ' → id=' + selected._realIndex + ' | ' + (selected.path || ''));
    return selected;
  }  console.log('[FindEp] ❌ Không tìm được tập ' + episode + ' (có ' + targetFiles.length + ' files)');
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
      console.log('[jac.red] ✅ Tổng unique: ' + unique.length);      if (unique.length === 0) return [];
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
var minSize = cfg.minSize || 0, maxSize = cfg.maxSize || 1000;

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
      if (commonSort === 'seeds') results.sort(function(a, b) { return b.seeds - a.seeds; });
      else if (commonSort === 'date') results.sort(function(a, b) { return (b.date || 0) - (a.date || 0); });
      else results.sort(function(a, b) { return b.sizeGB - a.sizeGB; });

      results.forEach(function(t) {
        if (!t.magnet) return;
        var title = t.title;
        var episodeMatch = title.match(/\bS(\d{1,2})\s*E(\d{1,2})\b/i);
        var isSingleEpisode = episodeMatch !== null;
        var isPack = !isSingleEpisode;

        if (isSingleEpisode && type === 'series' && season > 0 && episode > 0) {
          var torrentSeason = parseInt(episodeMatch[1]);
          var torrentEpisode = parseInt(episodeMatch[2]);
          if (torrentSeason !== season || torrentEpisode !== episode) { console.log('[Nguồn 2] ⏭️ Bỏ qua tập lẻ S' + torrentSeason + 'E' + torrentEpisode); return; }
        }

        if (isPack && type === 'series' && season > 0) {
          var sPad = String(season).padStart(2, '0');
          var seasonPattern = new RegExp('S' + sPad + '(?:[^\\d]|$)|Season\\s*' + season + '(?:[^\\d]|$)|第\\s*' + season + '\\s*季|S' + season + '(?:[^\\d]|$)', 'i');          var otherSeasonPattern = /S\d{1,2}(?:[^\d]|$)|Season\s*\d|第\s*\d+\s*季/gi;
          var hasOtherSeason = false;
          var matches = title.match(otherSeasonPattern);
          if (matches) {
            for (var i = 0; i < matches.length; i++) {
              var m = matches[i];
              if (!seasonPattern.test(m)) {
                var otherSeasonMatch = m.match(/\d+/);
                if (otherSeasonMatch && parseInt(otherSeasonMatch[0]) !== season) { hasOtherSeason = true; break; }
              }
            }
          }
          if (hasOtherSeason) { console.log('[Nguồn 2] ⏭️ Bỏ qua PACK có season khác'); return; }
        }

        var sizeGB = t.sizeGB.toFixed(2);
        var streamName = '🟢 ' + t.tracker;
        var badge = (type === 'series') ? (isPack ? '📦 PACK | ' : '🎬 TẬP LẺ | ') : '';
        var displayTitle = badge + title + '\n' + sizeGB + 'GB | 🟢 ' + t.seeds + '\n📡 Nguồn: ' + t.tracker;

        if (type === 'movie') {
          streams.push({ name: streamName, title: displayTitle, url: ts + '/stream/' + encodeURIComponent(title) + '?link=' + encodeURIComponent(t.magnet) + '&index=0&play', behaviorHints: { notWebReady: true, bingeGroup: t.source + '-' + idClean } });
        } else {
          var url = isPack ? pub + '/play?magnet=' + encodeURIComponent(t.magnet) + '&s=' + season + '&e=' + episode + '&title=' + encodeURIComponent(title) + '&ts=' + encodeURIComponent(ts) : ts + '/stream/' + encodeURIComponent(title) + '?link=' + encodeURIComponent(t.magnet) + '&index=0&play';
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
                var m = matches[i];                if (!singleSeasonPattern.test(m)) {
                  var otherSeasonMatch = m.match(/\d+/);
                  if (otherSeasonMatch && parseInt(otherSeasonMatch[0]) !== season) { hasOtherSeason = true; break; }
                }
              }
            }
            if (hasOtherSeason) { console.log('[jac.red] ⏭️ Bỏ qua PACK từng season khác: ' + title); return; }
            if (!singleSeasonPattern.test(title) && /S\d{1,2}|Season\s*\d|сезон\s*\d/.test(title)) { console.log('[jac.red] ⏭️ Bỏ qua PACK không rõ season: ' + title); return; }
          } else { console.log('[jac.red] 📦 PACK TRỌN BỘ: ' + title); }
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
  var domainOptions = '';
  for (var key in JAC_RED_DOMAINS) domainOptions += '<option value="' + key + '"' + (cfg.jacredDomain === key ? ' selected' : '') + '>' + key + '</option>';

  var css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
:root {
  --bg-primary: #0b0c10; --bg-secondary: #12141c; --bg-tertiary: #1a1d27;
  --border: #2a2d3a; --text-main: #e2e8f0; --text-muted: #94a3b8;
  --accent: #6366f1; --accent-hover: #818cf8; --success: #10b981; --danger: #ef4444;
  --radius: 12px; --shadow: 0 4px 12px rgba(0,0,0,0.4); --trans: all 0.2s cubic-bezier(0.4,0,0.2,1);
}
*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:var(--bg-primary);color:var(--text-main);line-height:1.6;min-height:100vh;padding:2rem 1rem}
.wrap{max-width:720px;margin:0 auto}
h1{text-align:center;font-size:2rem;font-weight:700;margin-bottom:2rem;background:linear-gradient(135deg,#6366f1,#8b5cf6,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.card{background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;margin-bottom:1.25rem;box-shadow:var(--shadow);transition:var(--trans)}
.card:hover{border-color:#3f4456;transform:translateY(-2px)}
.card h2{font-size:1rem;font-weight:600;color:var(--accent);margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem}
.fg{margin-bottom:1.25rem}
.fg label{display:block;color:var(--text-muted);font-size:0.8rem;font-weight:500;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em}
input[type="text"],input[type="number"],textarea,select{width:100%;padding:0.75rem 1rem;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:8px;color:var(--text-main);font-size:0.95rem;transition:var(--trans)}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(99,102,241,0.2)}
textarea{resize:vertical;min-height:80px;font-family:'JetBrains Mono',monospace}
.btn{padding:0.75rem 1.25rem;border:none;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:0.5rem;transition:var(--trans)}
.btn-p{background:linear-gradient(135deg,#10b981,#059669);color:#fff}
.btn-p:hover{filter:brightness(1.1);transform:translateY(-1px)}
.btn-b{background:linear-gradient(135deg,var(--accent),#8b5cf6);color:#fff;width:100%}
.btn-b:hover{filter:brightness(1.1)}
.btn-test{background:var(--bg-tertiary);color:var(--text-muted);border:1px solid var(--border);padding:0.5rem 1rem;font-size:0.8rem}
.btn-test:hover{color:var(--text-main);border-color:var(--accent)}
.ubox{background:#0a0b0e;border:1px solid var(--border);border-radius:8px;padding:1rem;font-family:'JetBrains Mono',monospace;font-size:0.85rem;color:#93c5fd;word-break:break-all;margin:1rem 0}
.brow{display:flex;gap:0.75rem;flex-wrap:wrap}
.trow{display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid var(--border)}
.trow:last-child{border-bottom:none}
.sw{position:relative;width:48px;height:26px;flex-shrink:0}
.sw input{opacity:0;width:0;height:0}
.sl{position:absolute;inset:0;background:#334155;border-radius:26px;cursor:pointer;transition:var(--trans)}
.sl:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:var(--trans)}
input:checked+.sl{background:var(--accent)}
input:checked+.sl:before{transform:translateX(22px)}
.sort-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-top:0.75rem}
.sort-btn{padding:0.6rem;background:var(--bg-tertiary);border:2px solid transparent;border-radius:10px;color:var(--text-muted);font-size:0.85rem;font-weight:600;cursor:pointer;transition:var(--trans);text-align:center}
.sort-btn:hover{border-color:#475569}
.sort-btn.active{border-color:var(--accent);background:rgba(99,102,241,0.1);color:var(--accent)}
.checkbox-group{display:flex;flex-wrap:wrap;gap:0.75rem;margin-top:0.5rem}
.checkbox-group label{display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:0.9rem;color:var(--text-main);text-transform:none}
.info-box{background:rgba(99,102,241,0.05);border-left:3px solid var(--accent);padding:1rem;border-radius:0 var(--radius) var(--radius) 0;margin-bottom:1rem}
.info-box p{color:var(--text-muted);font-size:0.85rem;margin-bottom:0.25rem}
.info-box strong{color:var(--text-main)}
.guide{background:var(--bg-secondary);border-radius:var(--radius);padding:1.5rem;margin-top:1.5rem}
.guide h3{color:var(--accent);font-size:1rem;margin-bottom:0.75rem}
.guide p,.guide li{color:var(--text-muted);font-size:0.9rem;line-height:1.6}
.guide code{background:var(--bg-tertiary);padding:0.2rem 0.5rem;border-radius:6px;font-family:'JetBrains Mono',monospace;font-size:0.8rem;color:var(--success)}
.footer{text-align:center;margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--border);color:var(--text-muted);font-size:0.85rem}
.ts-test-result{margin-top:0.75rem;padding:0.75rem;border-radius:8px;font-size:0.85rem;display:none}
.ts-test-result.success{background:rgba(16,185,129,0.1);color:var(--success);border:1px solid rgba(16,185,129,0.3)}
.ts-test-result.error{background:rgba(239,68,68,0.1);color:var(--danger);border:1px solid rgba(239,68,68,0.3)}
.ts-test-result.loading{background:rgba(148,163,184,0.1);color:var(--text-muted)}
@media(max-width:600px){.sort-grid{grid-template-columns:1fr}.brow{flex-direction:column}.checkbox-group{flex-direction:column}}
`;

  return `<!DOCTYPE html><html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hybrid Addon Config</title>
  <style>${css}</style>
</head>
<body>
  <div class="wrap">
    <h1>🎬 Hybrid Addon v6.4.0</h1>
    
    <div class="card">
      <h2>📋 Link Config Torrentio</h2>
      <div class="fg">
        <label>Dán link config</label>
        <div class="brow">
          <input type="text" id="configLink" placeholder="https://torrentio.strem.fun/...">
          <button class="btn btn-p" onclick="applyTorrentioConfig()">⚡ Áp dụng</button>
          <button class="btn btn-test" onclick="resetTorrentioConfig()">🔄 Reset</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>🟢 Torrentio</h2>
      <div class="trow">
        <span class="ti">🟢 Bật Torrentio</span>
        <label class="sw"><input type="checkbox" id="torrentioEnabled" ${cfg.torrentioEnabled ? 'checked' : ''}><span class="sl"></span></label>
      </div>
    </div>

    <div class="card">
      <h2>🟡 Bitsearch + TorrentCSV</h2>
      <div class="info-box">
        <p>🔍 <strong>Bitsearch</strong> - Công cụ tìm kiếm torrent DHT, tìm torrent từ mạng phân tán.</p>
        <p>📊 <strong>TorrentCSV</strong> - Kho dữ liệu torrent tổng hợp từ nhiều nguồn, cập nhật liên tục.</p>
      </div>
      <div class="trow">
        <span class="ti">🟡 Bật Bitsearch + CSV</span>
        <label class="sw"><input type="checkbox" id="bitsearchEnabled" ${cfg.bitsearchEnabled ? 'checked' : ''}><span class="sl"></span></label>
      </div>
    </div>

    <div class="card">
      <h2>🖥️ TorrServer</h2>
      <div class="fg">
        <label>URL</label>
        <div class="brow">
          <input type="text" id="tsUrl" value="${cfg.torrServerUrl}" placeholder="http://localhost:8090">
          <button class="btn btn-test" onclick="testTorrServer()">🔌 Test</button>        </div>
        <div id="tsTestResult" class="ts-test-result"></div>
      </div>
      <div class="info-box">
        <p>🖥️ <strong>TorrServer</strong> - Xem torrent online không cần tải. <a href="https://github.com/YouROK/TorrServer" target="_blank" style="color:var(--accent)">[Tải TorrServer]</a> · Cần điền đúng IP:Port</p>
      </div>
    </div>

    <div class="card">
      <h2>🔴 jac.red Settings</h2>
      <div class="info-box">
        <p>📡 <strong>jac.red</strong> - Công cụ tìm kiếm torrent Nga, hỗ trợ tiếng Nga, tìm phim lẻ và phim bộ chất lượng cao từ các tracker: RuTracker, KinoZal, NNMClub, Toloka, RuTor...</p>
        <p>🌐 <strong>Domain:</strong> Nếu một domain không truy cập được, hãy chọn domain khác.</p>
      </div>
      <div class="trow">
        <span class="ti">🔴 Bật jac.red</span>
        <label class="sw"><input type="checkbox" id="jacredEnabled" ${cfg.jacredEnabled ? 'checked' : ''}><span class="sl"></span></label>
      </div>
      <div class="fg">
        <label>Domain jac.red</label>
        <select id="jacredDomain">${domainOptions}</select>
        <p style="color:var(--text-muted);font-size:0.8rem;margin-top:0.5rem">🔥 jac.red, jac-red.ru, jr.maxvol.pro, ru.jacred.pro, jacred.stream</p>
      </div>
    </div>

    <div class="card">
      <h2>⚙️ Bộ lọc chung (jac.red, Bitsearch, CSV)</h2>
      <div class="info-box">
        <p>🔧 <strong>Cài đặt chung</strong> - Áp dụng cho jac.red, Bitsearch và TorrentCSV. Torrentio có cấu hình riêng.</p>
      </div>
      <div class="fg">
        <label>Sắp xếp kết quả</label>
        <div class="sort-grid">
          <button class="sort-btn ${cfg.commonSortBy==='size'?'active':''}" onclick="setCommonSort('size',this)">💾 Dung Lượng</button>
          <button class="sort-btn ${cfg.commonSortBy==='seeds'?'active':''}" onclick="setCommonSort('seeds',this)">👥 Seeds</button>
          <button class="sort-btn ${cfg.commonSortBy==='date'?'active':''}" onclick="setCommonSort('date',this)">📅 Mới Nhất</button>
        </div>
        <input type="hidden" id="commonSort" value="${cfg.commonSortBy}">
      </div>
      <div class="fg">
        <label>Số kết quả tối đa</label>
<div class="fg">
  <label>Khoảng dung lượng (GB)</label>
  <div class="brow">
    <input type="number" id="minSize" value="0" min="0" max="1000" placeholder="Min" step="0.1">
    <input type="number" id="maxSize" value="1000" min="0" max="1000" placeholder="Max" step="0.1">
  </div>
  <p style="color:#666;font-size:11px;margin-top:4px">Lọc torrent từ Min đến Max GB (0 = không giới hạn)</p>
</div>
        <input type="number" id="maxResults" value="${cfg.maxResults || 30}" min="5" max="100">
      </div>
<div class="fg">
  <label>Khoảng dung lượng (GB)</label>
  <div class="brow">
    <input type="number" id="minSize" value="0" min="0" max="1000" placeholder="Min" step="0.1">
    <input type="number" id="maxSize" value="1000" min="0" max="1000" placeholder="Max" step="0.1">
  </div>
  <p style="color:#666;font-size:11px;margin-top:4px">Lọc torrent từ Min đến Max GB (0 = không giới hạn)</p>
</div>
      <div class="fg">
        <label>🚫 Loại trừ độ phân giải</label>
        <div class="checkbox-group">
          <label><input type="checkbox" value="480p" ${(cfg.commonQualityFilter && cfg.commonQualityFilter.includes('480p'))?'checked':''}> 480p</label>
          <label><input type="checkbox" value="720p" ${(cfg.commonQualityFilter && cfg.commonQualityFilter.includes('720p'))?'checked':''}> 720p</label>
          <label><input type="checkbox" value="1080p" ${(cfg.commonQualityFilter && cfg.commonQualityFilter.includes('1080p'))?'checked':''}> 1080p</label>
          <label><input type="checkbox" value="4K" ${(cfg.commonQualityFilter && cfg.commonQualityFilter.includes('4K'))?'checked':''}> 4K</label>        </div>
        <p style="color:var(--text-muted);font-size:0.8rem;margin-top:0.5rem">Tick để ẩn các torrent có độ phân giải tương ứng</p>
      </div>
    </div>

    <div class="card">
      <h2>🎌 Anime Mode</h2>
      <div class="info-box">
        <p>🎌 <strong>Anime Mode</strong> - Dành cho pack anime bị TorrServer parse sai metadata. Sẽ lọc file &lt;500MB, bỏ qua OP/ED, và đếm file theo thứ tự.</p>
      </div>
      <div class="trow">
        <span class="ti">Bật khi xem anime bị chọn sai tập</span>
        <label class="sw"><input type="checkbox" id="animeMode" ${cfg.animeMode ? 'checked' : ''}><span class="sl"></span></label>
      </div>
    </div>

    <div class="card">
      <h2>📦 Link Cài Đặt</h2>
      <div class="ubox" id="iurl">${installUrl}</div>
      <div class="brow">
        <button class="btn btn-p" onclick="copyUrl()">📋 Copy</button>
        <a id="slink" href="${stremioUrl}" class="btn btn-b">[▶ Cài Vào Stremio]</a>
      </div>
    </div>

    <div class="card">
      <h2>📖 Mô Tả & GitHub</h2>
      <p style="color:var(--text-muted);margin-bottom:0.5rem">Dự án <strong style="color:var(--text-main)">🎬 Hybrid Addon</strong> - Tổng hợp nguồn phim từ Torrentio, jac.red, Bitsearch, TorrentCSV, phát qua TorrServer. Hỗ trợ phim lẻ và phim bộ với chọn tập thông minh.</p>
      <a href="${githubLink}" target="_blank" class="btn btn-test" style="text-decoration:none">🐙 GitHub Repository</a>
    </div>

    <div class="guide">
      <h3>🔗 Tạo Link</h3>
      <div class="step">1. Cấu hình Addon: Nhập URL TorrServer và bấm Test để kiểm tra. Bật/tắt nguồn, chọn domain.</div>
      <div class="step">2. Bộ lọc chung: Chọn cách sắp xếp, giới hạn số kết quả, loại trừ độ phân giải.</div>
      <div class="step">3. Anime Mode: Bật khi xem anime bị chọn sai tập.</div>
      <div class="step">4. Tạo link & Cài đặt: Nhấn "Copy" hoặc "Cài Vào Stremio".</div>
      <div class="step">5. Sử dụng: Tìm phim trong Stremio → Chọn stream từ "Hybrid Addon".</div>
    </div>

    <div class="footer">
      <p>⚠️ Cần có kết nối mạng ổn định. TorrServer nên đặt gần để giảm độ trễ.</p>
      <p style="margin-top:0.5rem">Made by fatcat with love</p>
    </div>
  </div>

  <script>
    var currentConfig = ${JSON.stringify({ providers: cfg.providers, sortBy: cfg.sortBy, language: cfg.language, qualityfilter: cfg.qualityfilter })};
    function setCommonSort(v, el) { document.getElementById('commonSort').value = v; document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); }
    function enc(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=/g, ''); }    function parseTorrentioLink(link) {
      try { var u = new URL(link.replace('stremio://', 'https://')); var m = u.pathname.match(/\\/([^\\/]+)\\/manifest\\.json/); if (!m) return null; var p = m[1].split('|'); var c = { providers: [], sortBy: 'size', language: '', qualityfilter: [] }; p.forEach(x => { var [k, v] = x.split('='); if (k === 'providers') c.providers = v.split(','); else if (k === 'sort') c.sortBy = v; else if (k === 'language') c.language = v; else if (k === 'qualityfilter') c.qualityfilter = v.split(','); }); return c; } catch (e) { return null; }
    }
    function applyTorrentioConfig() { var l = document.getElementById('configLink').value.trim(); if (!l) return alert('Dán link!'); var c = parseTorrentioLink(l); if (!c) return alert('Link lỗi!'); currentConfig = c; gen(); }
    function resetTorrentioConfig() { currentConfig = ${JSON.stringify(DEFAULT_TORRENTIO_CONFIG)}; document.getElementById('configLink').value = ''; gen(); }
    function getCurrentConfig() { return Object.assign({ torrServerUrl: document.getElementById('tsUrl').value.trim(), jacredEnabled: document.getElementById('jacredEnabled').checked, torrentioEnabled: document.getElementById('torrentioEnabled').checked, bitsearchEnabled: document.getElementById('bitsearchEnabled').checked, commonSortBy: document.getElementById('commonSort').value, maxResults: parseInt(document.getElementById('maxResults').value) || 30, jacredDomain: document.getElementById('jacredDomain').value, animeMode: document.getElementById('animeMode').checked, commonQualityFilter: Array.from(document.querySelectorAll('.checkbox-group input[type=checkbox]:checked')).map(c => c.value) }, currentConfig); }
    function copyUrl() { var url = document.getElementById('iurl').textContent; if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(function () { alert('✅ Đã copy link thành công!'); }).catch(function () { fallbackCopy(url); }); } else { fallbackCopy(url); } }
    function fallbackCopy(text) { var textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.top = '-9999px'; textarea.style.left = '-9999px'; document.body.appendChild(textarea); textarea.select(); try { document.execCommand('copy'); alert('✅ Đã copy link thành công!'); } catch (err) { alert('❌ Copy thất bại, vui lòng copy thủ công: ' + text); } document.body.removeChild(textarea); }
    function gen() { var c = getCurrentConfig(); var e = enc(c); var u = location.protocol + '//' + location.host + '/' + e + '/manifest.json'; document.getElementById('iurl').textContent = u; document.getElementById('slink').href = 'stremio://' + u.replace(/^https?:\\/\\//, ''); }
    async function testTorrServer() {
      var url = document.getElementById('tsUrl').value.trim(); var resultDiv = document.getElementById('tsTestResult');
      if (!url) { resultDiv.className = 'ts-test-result error'; resultDiv.style.display = 'block'; resultDiv.textContent = '❌ Vui lòng nhập URL TorrServer'; return; }
      if (!url.match(/^https?:\\/\\//)) { url = 'http://' + url; }
      resultDiv.className = 'ts-test-result loading'; resultDiv.style.display = 'block'; resultDiv.textContent = '⏳ Đang kiểm tra...';
      try {
        var controller = new AbortController(); var timeoutId = setTimeout(function () { controller.abort() }, 8000);
        var response = await fetch(url + '/echo', { method: 'GET', signal: controller.signal }); clearTimeout(timeoutId);
        if (response.ok) { resultDiv.className = 'ts-test-result success'; resultDiv.style.display = 'block'; resultDiv.textContent = '✅ Kết nối thành công! TorrServer đang hoạt động.'; } else { throw new Error('HTTP ' + response.status); }
      } catch (error) {
        resultDiv.className = 'ts-test-result error'; resultDiv.style.display = 'block';
        if (error.name === 'AbortError') { resultDiv.textContent = '❌ Timeout: Không thể kết nối đến TorrServer (sau 8 giây)'; } else { resultDiv.textContent = '❌ Lỗi kết nối: ' + error.message; }
      }
    }
    gen();
  </script>
</body>
</html>`;
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
