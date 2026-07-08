const SOURCE_ORDER = ['bilibili', 'xiaoheihe'];

function buildSearchQuery({ gameName = '', query = '', message = '' } = {}) {
  return [gameName, query || message].filter(Boolean).join(' ').trim();
}

function normalizeUrl(value = '') {
  if (value.startsWith('//')) {
    return `https:${value}`;
  }
  return value;
}

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractFirstLink(html = '', source) {
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html))) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1] || '';
    const title = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1] || stripTags(body);
    const url = normalizeUrl(decodeHtml(href));

    if (!url || !title) {
      continue;
    }

    if (source === 'bilibili' && !url.includes('bilibili.com')) {
      continue;
    }

    if (source === 'xiaoheihe' && !url.includes('xiaoheihe')) {
      continue;
    }

    return {
      title: stripTags(title),
      url
    };
  }

  return null;
}

const SEARCH_ADAPTERS = {
  bilibili: {
    buildUrl: (query) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(query)}`,
    parse: (html) => extractFirstLink(html, 'bilibili')
  },
  xiaoheihe: {
    buildUrl: (query) => `https://www.xiaoheihe.cn/search?keyword=${encodeURIComponent(query)}`,
    parse: (html) => extractFirstLink(html, 'xiaoheihe')
  }
};

export async function runResearchQuery(input = {}) {
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  const searchQuery = buildSearchQuery(input);
  const sources = [];
  const failures = [];

  if (!fetchImpl) {
    return {
      checkedSources: [...SOURCE_ORDER],
      searchQuery,
      sources,
      failures: ['当前运行环境不支持联网检索。']
    };
  }

  for (const source of SOURCE_ORDER) {
    const adapter = SEARCH_ADAPTERS[source];
    try {
      const response = await fetchImpl(adapter.buildUrl(searchQuery), {
        headers: {
          'user-agent': 'Mozilla/5.0 GameGuideAgentLab/0.1'
        }
      });

      if (!response.ok) {
        failures.push(`${source} 搜索失败：${response.status}`);
        continue;
      }

      const html = await response.text();
      const result = adapter.parse(html);

      if (!result) {
        failures.push(`${source} 没有解析到可用结果`);
        continue;
      }

      sources.push({
        source,
        title: result.title,
        url: result.url,
        summary: `搜索命中：${result.title}`,
        freshness: 'search-result'
      });
    } catch (error) {
      failures.push(`${source} 搜索失败：${error.message}`);
    }
  }

  return {
    checkedSources: [...SOURCE_ORDER],
    searchQuery,
    sources,
    failures
  };
}
