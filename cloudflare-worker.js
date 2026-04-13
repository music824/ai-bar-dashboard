/**
 * Cloudflare Worker - AI Bar Dashboard (Pure fetch, no Workers AI binding needed)
 * 
 * Deploy: dash.cloudflare.com → Workers & Pages → Create Worker → Paste this → Deploy
 * Then set secret: GROQ_API_KEY (optional, or use built-in llama)
 */

const GROQ_API_KEY = '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ status: 'ok', message: 'AI Bar Dashboard Worker v2' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const body = await request.json();
      const { action, headers, sample_rows, stats, daily, time_ranges, weeks } = body;

      if (action === 'detect') {
        // Column detection
        const sampleText = 'Headers: ' + JSON.stringify(headers) + '\n\nSample rows:\n' +
          sample_rows.slice(0, 10).map((row, i) => 'Row' + (i+1) + ': ' + JSON.stringify(row.map(c => String(c||'').trim()))).join('\n');

        const userPrompt = 'You are an Excel data parser. User uploaded a bar/night club revenue Excel with unknown format.\n\n' + sampleText + '\n\nReturn ONLY valid JSON (no other text):\n{"date_col": "column name or null", "time_col": "column name or null", "revenue_col": "column name or null"}';

        let reply;
        if (GROQ_API_KEY) {
          reply = await callGroq(userPrompt, 'You are an Excel data parser. Return ONLY JSON.', 150);
        } else {
          // Fallback: simple rule-based detection (no API needed)
          reply = JSON.stringify(simpleDetect(headers, sample_rows));
        }

        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return new Response(JSON.stringify({ success: true, mapping: JSON.parse(jsonMatch[0]) }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
        return new Response(JSON.stringify({ success: false, error: 'Cannot parse AI response', raw: reply }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

      } else if (action === 'analyze') {
        // Business analysis
        const dailyLines = Object.entries(daily||{}).sort().map(([d,v]) => d + ': $' + v.toLocaleString()).join('\n');
        const timeLines = Object.entries(time_ranges||{}).sort((a,b) => b[1]-a[1]).map(([t,v]) => t + ': $' + v.toLocaleString()).join('\n');
        const weekLines = Object.entries(weeks||{}).sort().slice(-6).map(([w,v]) => w + ': $' + v.toLocaleString()).join('\n');

        const userPrompt = 'You are a professional bar数据分析顾问. Analyze this data and give actionable advice in Chinese.\n\n' +
          'Core: ThisWeek=$' + (stats?.this_week||0).toLocaleString() + ' (growth:' + (stats?.growth||0) + '%), LastWeek=$' + (stats?.last_week||0).toLocaleString() +
          ', DailyAvg=$' + (stats?.daily_avg||0).toLocaleString() + ', Peak:' + (stats?.peak_time||'-') + '($"' + (stats?.peak_revenue||0).toLocaleString() + ')\n\n' +
          'Daily:\n' + (dailyLines||'N/A') + '\n\nTimeRanges:\n' + (timeLines||'N/A') + '\n\nWeeks:\n' + (weekLines||'N/A') + '\n\nReply in Chinese, concise, use emoji, cover: 1)本周评估 2)时段建议 3)下周行动.';

        let reply;
        if (GROQ_API_KEY) {
          reply = await callGroq(userPrompt, '你是专业酒吧经营数据分析顾问，用中文回复。', 600);
        } else {
          reply = simpleAnalysis(stats, daily, time_ranges);
        }

        return new Response(JSON.stringify({ success: true, reply }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown action: ' + action }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};

// ========== Groq API ==========
async function callGroq(userPrompt, systemPrompt, maxTokens) {
  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + GROQ_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: maxTokens
    })
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

// ========== Fallback: Simple Rule-Based Detection ==========
function simpleDetect(headers, sampleRows) {
  var dateCol = null, timeCol = null, revCol = null;
  var dateKws = ['日期','date','day','消费日期','营业日','销售日期','时间'];
  var timeKws = ['时段','time','range','早','中','晚','夜','班','shift','场'];
  var revKws = ['营业额','营收','收入','金额','实收','流水','销售','消费','cash','sales'];

  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toLowerCase();
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
      var s = String(sample||'');
      var num = parseFloat(s.replace(/[^0-9.]/g,''));
      if (num > 100 && num < 10000000) { revCol = headers[i]; break; }
    }
  }
  return { date_col: dateCol, time_col: timeCol, revenue_col: revCol };
}

// ========== Fallback: Simple Analysis (no API needed) ==========
function simpleAnalysis(stats, daily, time_ranges) {
  var growth = parseFloat(stats?.growth || 0);
  var peakT = stats?.peak_time || '-';
  var peakR = stats?.peak_revenue || 0;
  var dailyAvg = stats?.daily_avg || 0;

  var advice = '';
  if (growth >= 20) {
    advice += '📈 本周表现优秀！营业额环比增长 +' + growth + '%，继续保持！\n\n';
  } else if (growth >= 0) {
    advice += '📊 本周稳定持平，环比 +' + growth + '%。\n\n';
  } else {
    advice += '⚠️ 本周下滑 ' + Math.abs(growth) + '%，建议关注高峰时段「' + peakT + '」的服务质量。\n\n';
  }

  advice += '⏰ 时段分析：' + peakT + ' 是高峰时段，建议加强该时段人员配置和活动策划。\n\n';
  advice += '🚀 下周建议：\n';
  advice += '1. 制定高峰时段专属促销方案\n';
  advice += '2. 关注日均 ¥' + Math.round(dailyAvg).toLocaleString() + '，提升空间大\n';
  advice += '3. 每周复盘，持续跟踪数据变化';

  return advice;
}
