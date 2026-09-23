const CACHE_NAME = 'tassili-go-v1';
const assetsToCache = [
  '/',
  '/index.html',
  '/splash.html',
  '/driver.html',
  '/style.css',
  '/script.js',
  '/images/logo.png'
];

// تثبيت السيرفيس ووركر وتخزين الملفات الأساسية
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
  self.skipWaiting();
});

// تنشيط السيرفيس ووركر وحذف التخزين القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// جلب البيانات والملفات
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});