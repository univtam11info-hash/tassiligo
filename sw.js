const CACHE_NAME = 'tassili-go-v1';
const assetsToCache = [
  '/',
  '/splash.html',
  '/driver.html',
  '/images/logo5.png'
];


// تثبيت السيرفيس ووركر وتخزين الملفات الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
});

// جلب البيانات والملفات
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});