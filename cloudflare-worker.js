/**
 * AI Bar Dashboard - Cloudflare Worker
 * 部署：dash.cloudflare.com → Workers & Pages → Create Worker → 粘贴本代码 → Deploy
 */

async function handleRequest(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', message: 'AI Bar Dashboard Worker' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const { action, headers, sample_rows, stats, daily, time_ranges, weeks } = body;

  // ---- Column Detection ----
  if (action === 'detect') {
    const mapping = simpleDetect(headers || [], sample_rows || []);
    return new Response(JSON.stringify({ success: true, mapping }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // ---- AI Analysis ----
  if (action === 'analyze') {
    const reply = simpleAnalysis(stats || {}, daily || {}, time_ranges || {}, weeks || {});
    return new Response(JSON.stringify({ success: true, reply }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

// ---- Fallback: Simple Rule-Based Detection ----
function simpleDetect(headers, sampleRows) {
  var dateCol = null, timeCol = null, revCol = null;
  var dateKws = ['日期','date','day','消费日期','营业日','销售日期','时间','day'];
  var timeKws = ['时段','time','range','早','中','晚','夜','班','shift','场','period'];
  var revKws = ['营业额','营收','收入','金额','实收','流水','销售','消费','cash','sales','revenue','total'];

  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').toLowerCase();
    if (!dateCol && dateKws.some(function(k){ return h.indexOf(k) !== -1; })) dateCol = headers[i];
    if (!timeCol && timeKws.some(function(k){ return h.indexOf(k) !== -1; })) timeCol = headers[i];
    if (!revCol && revKws.some(function(k){ return h.indexOf(k) !== -1; })) revCol = headers[i];
  }
  if (!revCol) {
    for (var i = 0; i < headers.length; i++) {
      var sample = sampleRows[0] && sampleRows[0][i];
      if (typeof sample === 'number' && sample > 0 && sample < 10000000) {
        revCol = headers[i]; break;
      }
      var s = String(sample || '');
      var num = parseFloat(s.replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 100 && num < 10000000) {
        revCol = headers[i]; break;
      }
    }
  }
  return { date_col: dateCol, time_col: timeCol, revenue_col: revCol };
}

// ---- Fallback: Simple Analysis (no external API) ----
function simpleAnalysis(stats, daily, time_ranges) {
  var growth = parseFloat(stats.growth || 0);
  var peakT = stats.peak_time || '-';
  var peakR = stats.peak_revenue || 0;
  var dailyAvg = stats.daily_avg || 0;
  var thisWeek = stats.this_week || 0;

  var lines = [];
  lines.push('📊 本周营收分析');
  lines.push('');

  if (growth >= 20) {
    lines.push('✅ 本周表现优秀！营业额环比增长 +' + growth + '%，继续保持！');
  } else if (growth >= 5) {
    lines.push('📈 本周稳定增长 +' + growth + '%，继续保持！');
  } else if (growth >= 0) {
    lines.push('📊 本周持平，环比 +' + growth + '%。');
  } else {
    lines.push('⚠️ 本周下滑 ' + Math.abs(growth) + '%，建议关注高峰时段「' + peakT + '」的服务质量。');
  }

  lines.push('');
  lines.push('💰 本周总营收：¥' + thisWeek.toLocaleString());
  lines.push('📈 日均：¥' + Math.round(dailyAvg).toLocaleString());
  lines.push('');
  lines.push('⏰ 高峰时段：' + peakT + ' (¥' + peakR.toLocaleString() + ')');
  lines.push('');

  // Find best and worst days
  var entries = Object.entries(daily || {});
  if (entries.length > 0) {
    entries.sort(function(a, b){ return b[1] - a[1]; });
    lines.push('🏆 本周最佳：' + entries[0][0] + ' (¥' + entries[0][1].toLocaleString() + ')');
    if (entries.length > 1) {
      lines.push('📉 本周最低：' + entries[entries.length-1][0] + ' (¥' + entries[entries.length-1][1].toLocaleString() + ')');
    }
  }

  lines.push('');
  lines.push('🚀 下周建议：');
  lines.push('1. 重点关注高峰时段「' + peakT + '」的服务质量');
  lines.push('2. 制定时段专属促销方案提升低谷时段营收');
  lines.push('3. 每周复盘，持续跟踪数据变化');
  lines.push('');
  lines.push('💡 要获得更详细的AI分析建议，请配置Groq API Key');

  return lines.join('\n');
}

addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});
