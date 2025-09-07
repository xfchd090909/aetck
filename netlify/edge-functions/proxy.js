export default async (request, context) => {
  // 第一步：优先处理OPTIONS预请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204, // 预请求成功无需返回内容，204 No Content最佳
      headers: {
        'Access-Control-Allow-Origin': 'https://aetck.netlify.app', // 与实际请求一致
        'Access-Control-Allow-Methods': 'GET, OPTIONS', // 允许的方法（包含OPTIONS和实际请求的GET）
        'Access-Control-Allow-Headers': 'Content-Type, Origin, Referer', // 允许前端可能携带的头
        'Access-Control-Max-Age': '86400', // 预检结果缓存24小时，减少重复请求
        'Vary': 'Origin' // 告诉CDN根据Origin头缓存不同响应
      }
    });
  }
  
  // 1. 修复数组逗号语法错误
  const url = new URL(request.url);
  const target = url.searchParams.get('target');
  
  const allowedOrigins = [
    'https://www.loliapi.com',
    'https://nekos.best',
    'https://api.waifu.im',
    'https://image.anosu.top',
    'https://aetck.netlify.app'
  ];
  
  // 2. 验证目标URL合法性
  if (!target || !allowedOrigins.some(origin => target.startsWith(origin))) {
    return new Response('Invalid target URL', { 
      status: 403,
      headers: { 
        'Access-Control-Allow-Origin': 'https://aetck.netlify.app',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Vary': 'Origin'
      } 
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
    modifiedResponse.headers.set('Access-Control-Allow-Origin', 'https://aetck.netlify.app');
    modifiedResponse.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    modifiedResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Origin, Referer');
    modifiedResponse.headers.set('Vary', 'Origin'); // 关键：解决CDN缓存导致的跨域问题

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
        'Access-Control-Allow-Origin': 'https://aetck.netlify.app',
        'Content-Type': 'text/plain'
      }
    });
  }
};

export const config = { path: "/proxy" };
