/**
 * Cloudflare Worker - AI Bar Dashboard Backend
 * 使用 Cloudflare Workers AI（免费，无需 API Key）
 * 
 * 部署步骤：
 * 1. 打开 https://dash.cloudflare.com
 * 2. 左侧 Workers & Pages → Create Application → Create Worker
 * 3. 删除默认代码，粘贴本文件全部内容
 * 4. 点 Deploy
 * 5. 复制 Worker URL（如 https://xxx.your-subdomain.workers.dev）
 */

export default {
  async fetch(request, env, ctx) {
    // CORS
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
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const body = await request.json();
      const { action, headers, sample_rows, stats, daily, time_ranges, weeks } = body;

      if (action === 'detect') {
        // AI 列识别
        const sampleText = `表头: ${JSON.stringify(headers)}\n\n前10行数据:\n` +
          sample_rows.slice(0, 10).map((row, i) => `行${i+1}: ${JSON.stringify(row.map(c => String(c||'').trim()))}`).join('\n');

        const prompt = `你是一个Excel数据解析助手。用户上传了酒吧/门店的营业数据Excel。

表头和数据样本：
${sampleText}

请分析后返回JSON格式，告诉我哪列是日期、哪列是时段（可能没有）、哪列是金额。只返回JSON：
{"date_col": "列名", "time_col": "列名或null", "revenue_col": "列名"}`;

        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [
            { role: 'system', content: '你是一个专业的Excel数据解析助手。只返回JSON格式，不要其他文字。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 200,
          temperature: 0.1
        });

        const reply = aiResponse.choices?.[0]?.message?.content || '';
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return new Response(JSON.stringify({ success: true, mapping: JSON.parse(jsonMatch[0]) }), {
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
        return new Response(JSON.stringify({ success: false, error: '无法解析AI响应', raw: reply }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });

      } else if (action === 'analyze') {
        // AI 分析建议
        const dailyLines = Object.entries(daily||{}).sort().map(([d,v]) => `${d}: ¥${v.toLocaleString()}`).join('\n');
        const timeLines = Object.entries(time_ranges||{}).sort((a,b)=>b[1]-a[1]).map(([t,v]) => `${t}: ¥${v.toLocaleString()}`).join('\n');
        const weekLines = Object.entries(weeks||{}).sort().slice(-6).map(([w,v]) => `${w}: ¥${v.toLocaleString()}`).join('\n');

        const prompt = `你是专业的酒吧经营数据分析顾问，用中文分析数据并给出可执行的建议。

核心数据：本周¥${(stats?.this_week||0).toLocaleString()}（环比${stats?.growth||0}%）vs上周¥${(stats?.last_week||0).toLocaleString()}，日均¥${(stats?.daily_avg||0).toLocaleString()}，高峰${stats?.peak_time||'-'}(¥${(stats?.peak_revenue||0).toLocaleString()})

每日营业额：
${dailyLines||'暂无'}

时段分布：
${timeLines||'暂无'}

近周对比：
${weekLines||'暂无'}

请从：1)本周评估 2)时段建议 3)下周行动 三个维度用中文简洁回答，重点用emoji标注。`;

        const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [
            { role: 'system', content: '你是一位专业的酒吧经营数据分析顾问，用中文回复，语言简洁专业，数据驱动，重点突出。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 800,
          temperature: 0.7
        });

        const reply = aiResponse.choices?.[0]?.message?.content || 'AI暂时不可用，请稍后重试。';
        return new Response(JSON.stringify({ success: true, reply }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      return new Response(JSON.stringify({ error: 'Unknown action' }), {
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
