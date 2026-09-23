import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [5.5228, 22.7850],
    zoom: 14
});
window.mapInstance = map;

const geolocate = new mapboxgl.GeolocateControl({
    positionOptions: {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    },
    trackUserLocation: true,
    showUserLocation: true
});
map.addControl(geolocate, 'top-left');

let driverCoordinates = [5.5228, 22.7850];
let driverDocId = null;
let isOnline = false;
let ordersUnsubscribe = null;
let activeAcceptedOrder = null;
let clientMarker = null;
let destinationMarker = null;
let driverPhone = localStorage.getItem('driverPhone') || localStorage.getItem('userPhone') || '+213663597729';
let hasArrivedToClient = false;

function calculateDistanceInMeters(coord1, coord2) {
    if (!coord1 || !coord2) return 999999;
    const lon1 = Number(coord1[0]);
    const lat1 = Number(coord1[1]);
    const lon2 = Number(coord2[0]);
    const lat2 = Number(coord2[1]);

    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

geolocate.on('geolocate', async (position) => {
    driverCoordinates = [position.coords.longitude, position.coords.latitude];

    if (driverDocId) {
        try {
            await updateDoc(doc(db, "drivers", driverDocId), {
                currentLocation: driverCoordinates,
                lastUpdated: new Date()
            });
        } catch (e) {
            console.error("خطأ في تحديث إحداثيات السائق:", e);
        }
    }

    if (activeAcceptedOrder && activeAcceptedOrder.id) {
        try {
            await updateDoc(doc(db, "orders", activeAcceptedOrder.id), {
                driverLocation: driverCoordinates
            });
        } catch (e) {
            console.error("خطأ في تحديث موقع السائق في الطلب:", e);
        }

        if (!hasArrivedToClient && activeAcceptedOrder.pickupCoords) {
            const distanceToClient = calculateDistanceInMeters(driverCoordinates, activeAcceptedOrder.pickupCoords);
            console.log("المسافة الحالية للزبون بالمتر:", distanceToClient);

            drawRouteWithArrows(driverCoordinates, activeAcceptedOrder.pickupCoords, '#ef4444');

            // توسيع نطاق دالة الوصول التلقائي إلى 35 متر لضمان تفاعلها بدقة عند الاقتراب
            if (distanceToClient <= 35) {
                triggerArrivalAtClient();
            }
        } else if (hasArrivedToClient && activeAcceptedOrder.destinationCoords) {
            drawRouteWithArrows(driverCoordinates, activeAcceptedOrder.destinationCoords, '#10b981');
        }
    }
});

// دالة تأكيد الوصول للزبون (تستدعي تلقائياً أو عبر الضغط اليدوي)
window.triggerArrivalAtClient = function () {
    if (hasArrivedToClient) return;
    hasArrivedToClient = true;

    const container = document.getElementById('ordersContainer');
    if (container) {
        container.innerHTML = `
            <div style="background:#ecfdf5; border: 2px solid #10b981; color:#065f46; padding:15px; border-radius:12px; text-align:center;">
                <h3 style="margin:0 0 8px 0;"><i class="fa-solid fa-circle-check"></i> لقد وصلت إلى موقع الزبون!</h3>
                <p style="margin:0 0 10px 0; font-size:14px;"><strong>وجهة التوصيل المطلوبة:</strong> ${activeAcceptedOrder.destinationText || 'غير محددة'}</p>
                <div style="background:#d1fae5; padding:8px; border-radius:6px; font-weight:bold; font-size:13px;">جاري توجيهك نحو الوجهة النهائية...تتبع الطريق عبر الGPS او يمكنك فتح الخريطة لمعرفة المكان بالظبط</div>
            </div>
        `;
    }

    if (activeAcceptedOrder && activeAcceptedOrder.destinationCoords) {
        if (destinationMarker) destinationMarker.remove();
        destinationMarker = new mapboxgl.Marker({ color: '#3b82f6' })
            .setLngLat(activeAcceptedOrder.destinationCoords)
            .setPopup(new mapboxgl.Popup().setHTML(`<h4>وجهة التوصيل: ${activeAcceptedOrder.destinationText || ''}</h4>`))
            .addTo(map);

        drawRouteWithArrows(driverCoordinates, activeAcceptedOrder.destinationCoords, '#10b981');
    }
};

async function loadDriverData() {
    try {
        const q = query(collection(db, "drivers"), where("phone", "==", driverPhone));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const dDoc = snap.docs[0];
            driverDocId = dDoc.id;
            const data = dDoc.data();
            document.getElementById('driver-name').innerText = data.full_name || 'سائق Tassili Go';
            document.getElementById('driver-phone').innerText = data.phone || driverPhone;
            document.getElementById('driver-wallet').innerText = data.wallet_balance || 0;
        } else {
            document.getElementById('driver-name').innerText = 'حساب السائق غير مسجل';
            document.getElementById('driver-phone').innerText = driverPhone;
        }
    } catch (e) {
        console.error("خطأ في جلب بيانات السائق:", e);
    }
}

loadDriverData();

window.toggleDriverStatus = async function () {
    if (!driverDocId) {
        alert('خطأ: لم يتم التعرف على حساب السائق في قاعدة البيانات.');
        return;
    }

    isOnline = !isOnline;
    const btn = document.getElementById('status-btn');

    try {
        if (isOnline) {
            btn.innerHTML = '<i class="fa-solid fa-power-off"></i> متصل (يستقبل الطلبات)';
            btn.className = 'btn-toggle online';
            await updateDoc(doc(db, "drivers", driverDocId), { is_online: true });
            listenForOrders();
            setTimeout(() => { geolocate.trigger(); }, 1000);
        } else {
            btn.innerHTML = '<i class="fa-solid fa-power-off"></i> متوقف (لا يستقبل طلبات)';
            btn.className = 'btn-toggle';
            await updateDoc(doc(db, "drivers", driverDocId), { is_online: false });
            if (ordersUnsubscribe) ordersUnsubscribe();

            const container = document.getElementById('ordersContainer');
            if (container) container.innerHTML = '';
        }
    } catch (err) {
        console.error("خطأ في تحديث الحالة:", err);
        isOnline = !isOnline;
    }
};

function listenForOrders() {
    ordersUnsubscribe = onSnapshot(collection(db, "orders"), (snapshot) => {
        const container = document.getElementById('ordersContainer');
        if (!container) return;

        container.innerHTML = '';
        if (!isOnline) return;

        snapshot.forEach((docSnap) => {
            const order = docSnap.data();
            if (order.status === "pending") {
                const orderDataStr = JSON.stringify({
                    pickupCoords: order.pickupCoords || [5.5228, 22.7850],
                    destinationCoords: order.destinationCoords || null,
                    destinationText: order.destinationText || ''
                });

                const orderCard = document.createElement('div');
                orderCard.className = 'incoming-order-card';
                orderCard.innerHTML = `
                    <h3 style="color:#b45309; margin-top:0;"><i class="fa-solid fa-bell"></i> طلب توصيل جديد متاح!</h3>
                    <p><strong>الوجهة:</strong> <span>${order.destinationText || '-'}</span></p>
                    <p><strong>السعر المعروض:</strong> <span style="color:#059669; font-weight:bold;">${order.price || 0}</span> دج</p>
                    <p><strong>هاتف الزبون:</strong> <span>${order.clientPhone || '-'}</span></p>
                    
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button onclick="acceptSpecificOrder('${docSnap.id}', '${escapeHtml(orderDataStr)}')" style="flex:1; background:#10b981; color:white; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">قبول الطلب والتوجه للزبون</button>
                    </div>
                `;
                container.appendChild(orderCard);
            }
        });
    });
}

function escapeHtml(string) {
    return string.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
}

window.acceptSpecificOrder = async function (orderId, orderDataStr) {
    try {
        const orderData = JSON.parse(orderDataStr);

        await updateDoc(doc(db, "orders", orderId), {
            status: "accepted",
            driverName: document.getElementById('driver-name').innerText,
            driverPhone: driverPhone,
            driverLocation: driverCoordinates
        });

        activeAcceptedOrder = {
            id: orderId,
            pickupCoords: orderData.pickupCoords,
            destinationCoords: orderData.destinationCoords,
            destinationText: orderData.destinationText
        };
        hasArrivedToClient = false;

        const container = document.getElementById('ordersContainer');
        if (container) {
            container.innerHTML = `
                <div style="background:#d1fae5; color:#065f46; padding:15px; border-radius:8px; text-align:center;">
                    <p style="margin:0 0 10px 0; font-weight:bold;">تم قبول الطلب! جاري رسم المسار الأحمر للوصول إلى موقع الزبون.</p>
                    <button onclick="triggerArrivalAtClient()" style="background:#3b82f6; color:white; border:none; padding:8px 15px; border-radius:6px; font-weight:bold; cursor:pointer;">
                        <i class="fa-solid fa-check-double"></i> لقد وصلت إلى الزبون (تأكيد يدوي)
                    </button>
                </div>
            `;
        }

        if (ordersUnsubscribe) ordersUnsubscribe();

        if (clientMarker) clientMarker.remove();
        clientMarker = new mapboxgl.Marker({ color: '#ef4444' })
            .setLngLat(orderData.pickupCoords)
            .setPopup(new mapboxgl.Popup().setHTML('<h4>موقع الزبون</h4>'))
            .addTo(map);

        drawRouteWithArrows(driverCoordinates, orderData.pickupCoords, '#ef4444');

    } catch (e) {
        console.error(e);
        alert('حدث خطأ أثناء قبول الطلب.');
    }
};

async function drawRouteWithArrows(startCoord, endCoord, lineColor = '#ef4444') {
    try {
        const queryUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${startCoord[0]},${startCoord[1]};${endCoord[0]},${endCoord[1]}?geometries=geojson&overview=full&steps=true&access_token=${mapboxgl.accessToken}`;
        const res = await fetch(queryUrl);
        const data = await res.json();
        if (!data.routes || data.routes.length === 0) return;

        const routeGeoJSON = data.routes[0].geometry;

        if (map.getSource('route')) {
            map.getSource('route').setData(routeGeoJSON);
            map.setPaintProperty('route-line', 'line-color', lineColor);
        } else {
            map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: routeGeoJSON } });

            map.addLayer({
                id: 'route-line',
                type: 'line',
                source: 'route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': lineColor,
                    'line-width': 6,
                    'line-opacity': 0.8
                }
            });

            map.addLayer({
                id: 'route-arrows',
                type: 'symbol',
                source: 'route',
                layout: {
                    'symbol-placement': 'line',
                    'symbol-spacing': 40,
                    'icon-image': 'triangle-15',
                    'icon-size': 1.4,
                    'icon-rotate': 90,
                    'icon-rotation-alignment': 'map',
                    'icon-allow-overlap': true
                },
                paint: {
                    'icon-color': '#ffffff'
                }
            });
        }
    } catch (e) {
        console.error("خطأ في تحديث مسار الأسهم:", e);
    }
}