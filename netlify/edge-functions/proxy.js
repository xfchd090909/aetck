export default async (request, context) => {
  const url = new URL(request.url);
  const target = url.searchParams.get('target');
  
  // 验证目标URL是否在允许的列表中
  const allowedOrigins = [
    'https://www.loliapi.com',
    'https://nekos.best',
    'https://api.waifu.im',
    'https://aenews.dpdns.org'
  ];
  
  if (!target || !allowedOrigins.some(origin => target.startsWith(origin))) {
    return new Response('Invalid target URL', { status: 403 });
  }
  
  try {
    const response = await fetch(target);
    return new Response(response.body, {
      headers: response.headers,
      status: response.status
    });
  } catch (error) {
    return new Response('Proxy request failed', { status: 500 });
  }
};

export const config = {
  path: "/proxy"
};
