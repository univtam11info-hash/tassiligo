import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, onSnapshot, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyB_wXfOUypNTgR4UsC556XYhsyyhI683w0",
    authDomain: "tassiligo-e248d.firebaseapp.com",
    projectId: "tassiligo-e248d",
    storageBucket: "tassiligo-e248d.firebasestorage.app",
    messagingSenderId: "43966193922",
    appId: "1:43966193922:web:667acb5cf50e29768d621b",
    measurementId: "G-W8JFZ4RJCC"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

mapboxgl.accessToken = 'pk.eyJ1IjoidGFzc2lsaWdvIiwiYSI6ImNtdTc5NGlubDBqMjMyd3MybzBiOHRleHcifQ.3Buy3PNtm85E6CIsealgqQ';

mapboxgl.setRTLTextPlugin(
    'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.3.0/mapbox-gl-rtl-text.js',
    null,
    true
);

// إحداثيات تمنراست الافتراضية كاحتياط فقط
let userCoordinates = [5.5228, 22.7850];
let destinationMarker = null;
let activeDestination = null;
let currentOrderId = null;
let orderUnsubscribe = null;
let driverLiveMarker = null;
let clientWatchId = null; // لمراقبة موقع الزبون بدقة وتحعيله

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: userCoordinates,
    zoom: 14
});
window.mapInstance = map;

const geolocate = new mapboxgl.GeolocateControl({ 
    positionOptions: { 
        enableHighAccuracy: true, // إجبار الهاتف على استخدام الـ GPS الحقيقي وليس الشبكة لتفادي خطأ البليدة
        timeout: 15000, 
        maximumAge: 0 
    }, 
    trackUserLocation: true,
    showUserLocation: true
});
map.addControl(geolocate, 'top-left');

// دالة تتبع موقع الزبون الحقيقي بدقة مستمرة (GPS Tracking) لمنع التوجيه الخاطئ
function startClientPreciseTracking() {
    if (!navigator.geolocation) {
        alert('متصفحك لا يدعم تحديد الموقع الجغرافي.');
        return;
    }

    const options = {
        enableHighAccuracy: true, // دقة عالية جداً (تمنع خطأ مواقع الأبراج والـ IP)
        timeout: 10000,
        maximumAge: 0
    };

    clientWatchId = navigator.geolocation.watchPosition(
        async (position) => {
            const lng = position.coords.longitude;
            const lat = position.coords.latitude;
            userCoordinates = [lng, lat];

            // تحريك الخريطة تلقائياً لموقع الزبون الحقيقي أول مرة أو عند الحركة القوية
            // map.setCenter(userCoordinates);

            // إذا كان هناك طلب نشط، قم بتحديث موقع الزبون فوراً في قاعدة البيانات ليراه السائق بدقة
            if (currentOrderId) {
                try {
                    await updateDoc(doc(db, "orders", currentOrderId), {
                        pickupCoords: userCoordinates
                    });
                } catch (e) {
                    console.error("خطأ في تحديث موقع الزبون:", e);
                }
            }
        },
        (error) => {
            console.warn("خطأ في تحديد الـ GPS الدقيق للزبون:", error.message);
            switch(error.code) {
                case error.PERMISSION_DENIED:
                    alert('يرجى السماح بالتطبيق بالوصول إلى موقعك الجغرافي من إعدادات المتصفح.');
                    break;
                case error.POSITION_UNAVAILABLE:
                    alert('إشارة الـ GPS ضعيفة، يرجى الخروج لمكان مكشوف أو تفعيل GPS الهاتف.');
                    break;
            }
        },
        options
    );
}

// تشغيل تتبع موقع الزبون بمجرد فتح الصفحة
startClientPreciseTracking();

map.on('click', async (e) => {
    const clickedCoord = [e.lngLat.lng, e.lngLat.lat];
    activeDestination = clickedCoord;
    if (destinationMarker) destinationMarker.setLngLat(clickedCoord);
    else destinationMarker = new mapboxgl.Marker({ color: '#ef4444' }).setLngLat(clickedCoord).addTo(map);

    await drawRoute(userCoordinates, clickedCoord);
    document.getElementById('destination-input').value = `إحداثيات: ${clickedCoord[1].toFixed(4)}, ${clickedCoord[0].toFixed(4)}`;
});

async function drawRoute(startCoord, endCoord, lineColor = '#10b981') {
    try {
        const queryUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoord[0]},${startCoord[1]};${endCoord[0]},${endCoord[1]}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
        const res = await fetch(queryUrl);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) return;

        const routeGeoJSON = data.routes[0].geometry;
        if (map.getSource('route')) {
            map.getSource('route').setData(routeGeoJSON);
            map.setPaintProperty('route', 'line-color', lineColor);
        } else {
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: routeGeoJSON } });
            map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': lineColor, 'line-width': 6 } });
        }
    } catch (e) { console.error(e); }
}

window.requestRide = async function() {
    const destinationInput = document.getElementById('destination-input').value.trim();
    const priceInput = document.getElementById('bidding-price').value.trim();

    if (!destinationInput || !priceInput || !activeDestination) {
        alert('يرجى تحديد وجهتك بدقة على الخريطة وإدخال السعر.');
        return;
    }

    const clientPhone = localStorage.getItem('userPhone') || '+213660000000';

    try {
        const orderData = {
            clientPhone: clientPhone,
            clientName: "زبون Tassili",
            destinationText: destinationInput,
            destinationCoords: activeDestination,
            pickupCoords: userCoordinates, // الإحداثيات الحقيقية للـ GPS الدقيق
            price: Number(priceInput),
            status: "pending",
            createdAt: new Date()
        };

        const docRef = await addDoc(collection(db, "orders"), orderData);
        currentOrderId = docRef.id;

        document.getElementById('ride-request-panel').style.display = 'none';
        document.getElementById('waiting-bids-view').style.display = 'block';

        orderUnsubscribe = onSnapshot(doc(db, "orders", currentOrderId), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.status === "accepted") {
                    document.getElementById('waiting-bids-view').style.display = 'none';
                    document.getElementById('active-ride-view').style.display = 'block';

                    document.getElementById('active-driver-name').innerText = data.driverName || 'سائق معتمد';
                    document.getElementById('active-driver-phone').innerText = data.driverPhone || '---';
                    document.getElementById('driver-call-btn').href = `tel:${data.driverPhone}`;

                    if (data.driverLocation) {
                        const driverLiveCoord = data.driverLocation;
                        
                        if (!driverLiveMarker) {
                            driverLiveMarker = new mapboxgl.Marker({ color: '#10b981' })
                                .setLngLat(driverLiveCoord)
                                .addTo(map);
                        } else {
                            driverLiveMarker.setLngLat(driverLiveCoord);
                        }

                        drawRoute(driverLiveCoord, userCoordinates, '#10b981');
                    }
                }
            } else {
                alert('تم إلغاء الرحلة.');
                window.location.reload();
            }
        });

    } catch (err) {
        console.error(err);
        alert('فشل إرسال الطلب.');
    }
};

document.getElementById('cancel-search-btn').addEventListener('click', async () => {
    if (currentOrderId) {
        await deleteDoc(doc(db, "orders", currentOrderId));
    }
    if(orderUnsubscribe) orderUnsubscribe();
    window.location.reload();
});

document.getElementById('cancel-active-ride-btn').addEventListener('click', async () => {
    if (currentOrderId) {
        await deleteDoc(doc(db, "orders", currentOrderId));
    }
    if(orderUnsubscribe) orderUnsubscribe();
    window.location.reload();
});