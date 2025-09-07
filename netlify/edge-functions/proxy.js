export default async (request, context) => {
  const url = new URL(request.url);
  const target = url.searchParams.get('target');
  
  // 1. 修复数组逗号语法错误
  const allowedOrigins = [
    'https://www.loliapi.com',
    'https://nekos.best',
    'https://api.waifu.im',
    'https://image.anosu.top',  // 新增逗号
    'https://aetck.netlify.app'
  ];
  
  // 2. 验证目标URL合法性
  if (!target || !allowedOrigins.some(origin => target.startsWith(origin))) {
    return new Response('Invalid target URL', { 
      status: 403,
      headers: { 'Access-Control-Allow-Origin': '*' }  // 统一添加CORS头
    });
  }

  // 3. 缓存逻辑（新增CORS处理）
  const isPixivRequest = target.includes('pixiv/direct');
  const cacheKey = isPixivRequest ? `__proxy_cache__${target}` : null;
  
  if (cacheKey) {
    const cachedResponse = await context.cache.get(cacheKey);
    if (cachedResponse) {
      // 给缓存响应添加CORS头后返回
      const cachedWithCORS = new Response(cachedResponse.body, cachedResponse);
      cachedWithCORS.headers.set('Access-Control-Allow-Origin', '*');
      return cachedWithCORS;
    }
  }

  try {
    // 4. 10秒超时控制 + fetch错误处理
    const response = await Promise.race([
      fetch(target),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
    ]);

    // 检查fetch是否返回成功状态（200-299）
    if (!response.ok) {
      throw new Error(`Target server responded with ${response.status}`);
    }

    // 5. 复制响应并添加缓存头 + CORS头
    const modifiedResponse = new Response(response.body, response);
    // 统一添加跨域支持（根据实际需求可限制为特定域名，如request.headers.get('Origin')）
    modifiedResponse.headers.set('Access-Control-Allow-Origin', 'https://aetck.netlify.app');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    if (isPixivRequest) {
      modifiedResponse.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      // 存入Netlify边缘缓存（1小时有效期）
      await context.cache.put(cacheKey, modifiedResponse.clone(), { ttl: 3600 });
    }

    return modifiedResponse;

  } catch (error) {
    // 6. 错误响应统一添加CORS头
    return new Response(`Proxy failed: ${error.message}`, { 
      status: 500,
      headers: { 
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain'
      }
    });
  }
};

export const config = { path: "/proxy" };
