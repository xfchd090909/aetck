export default async (request, context) => {
  const url = new URL(request.url);
  const target = url.searchParams.get('target');
  
  const allowedOrigins = [
    'https://www.loliapi.com',
    'https://nekos.best',
    'https://api.waifu.im',
    'https://image.anosu.top'
  ];
  
  if (!target || !allowedOrigins.some(origin => target.startsWith(origin))) {
    return new Response('Invalid target URL', { status: 403 });
  }

  // 仅对pixiv相关请求启用缓存（判断URL特征）
  const isPixivRequest = target.includes('pixiv/direct');
  const cacheKey = isPixivRequest ? `__proxy_cache__${target}` : null;

  // 尝试从缓存获取
  if (cacheKey) {
    const cachedResponse = await context.cache.get(cacheKey);
    if (cachedResponse) {
      return cachedResponse; // 直接返回缓存结果
    }
  }

  try {
    // 10秒超时控制（避免长期挂起）
    const response = await Promise.race([
      fetch(target),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
    ]);

    // 复制响应并添加缓存头（对pixiv请求设置合理缓存时间）
    const modifiedResponse = new Response(response.body, response);
    if (isPixivRequest) {
      modifiedResponse.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      // 存入Netlify边缘缓存（1小时有效期）
      await context.cache.put(cacheKey, modifiedResponse.clone(), { ttl: 3600 });
    }

    return modifiedResponse;
  } catch (error) {
    return new Response(`Proxy failed: ${error.message}`, { status: 500 });
  }
};

export const config = { path: "/proxy" };
