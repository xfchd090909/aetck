export default async (request, context) => {
  const url = new URL(request.url);
  const target = url.searchParams.get('target');
  
  // 允许的目标源（保持你的安全限制）
  const allowedOrigins = [
    'https://www.loliapi.com',
    'https://nekos.best',
    'https://api.waifu.im',
    'https://image.anosu.top'
  ];
  
  // 1. 验证目标URL合法性
  if (!target || !allowedOrigins.some(origin => target.startsWith(origin))) {
    return new Response('Invalid target URL', { status: 403 });
  }

  // 2. 修复缓存判断逻辑：匹配所有 pixiv 相关请求（包括 json 和 direct）
  const isPixivRequest = target.includes('pixiv/'); // 修改为匹配 "pixiv/" 即可覆盖所有pixiv接口
  const cacheKey = isPixivRequest ? `__proxy_cache__${target}` : null;

  // 3. 尝试从Netlify边缘缓存获取数据
  if (cacheKey) {
    const cachedResponse = await context.cache.get(cacheKey);
    if (cachedResponse) {
      // 注意：返回缓存时也要添加CORS头（避免缓存的响应缺失头部）
      const cachedWithCORS = addCORSHeaders(cachedResponse, request);
      return cachedWithCORS;
    }
  }

  try {
    // 4. 10秒超时控制 + 修复请求头部传递（关键：传递前端头部，确保参数被目标服务器识别）
    const response = await Promise.race([
      fetch(target, {
        // 传递前端请求的关键头部，模拟浏览器请求
        headers: {
          'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
          'Accept': request.headers.get('Accept') || 'image/webp,image/*,*/*;q=0.8',
          'Referer': request.headers.get('Referer') || '', // 部分API需要Referer验证
        },
        method: request.method, // 支持GET/POST等多种请求方法
        body: request.body, // 传递请求体（如果有）
        redirect: 'follow' // 允许重定向，避免请求失败
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
    ]);

    // 5. 复制响应并添加缓存头（仅对pixiv请求）
    const modifiedResponse = new Response(response.body, response);
    if (isPixivRequest) {
      modifiedResponse.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      // 存入缓存前先添加CORS头（确保缓存的响应也包含CORS）
      const responseWithCORS = addCORSHeaders(modifiedResponse, request);
      await context.cache.put(cacheKey, responseWithCORS.clone(), { ttl: 3600 });
      return responseWithCORS;
    }

    // 6. 非pixiv请求直接添加CORS头后返回
    const responseWithCORS = addCORSHeaders(modifiedResponse, request);
    return responseWithCORS;

  } catch (error) {
    // 错误响应也添加CORS头，避免前端无法捕获错误
    const errorResponse = new Response(`Proxy failed: ${error.message}`, { status: 500 });
    return addCORSHeaders(errorResponse, request);
  }
};

// 工具函数：统一添加CORS响应头（安全且灵活）
function addCORSHeaders(response, request) {
  const origin = request.headers.get('Origin') || '*';
  const modified = new Response(response.body, response);
  
  // 核心CORS头部
  modified.headers.set('Access-Control-Allow-Origin', origin); // 动态匹配前端Origin，比*更安全
  modified.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); // 支持常用方法
  modified.headers.set('Access-Control-Allow-Headers', 'User-Agent, Accept, Referer, Content-Type'); // 允许前端传递的头部
  modified.headers.set('x-content-type-options', 'nosniff'); // 增强安全性
  
  return modified;
}

export const config = { path: "/proxy" };
