import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// إعدادات Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB_wXfOUypNTgR4UsC556XYhsyyhI683w0",
    authDomain: "tassiligo-e248d.firebaseapp.com",
    projectId: "tassiligo-e248d",
    storageBucket: "tassiligo-e248d.firebasestorage.app",
    messagingSenderId: "43966193922",
    appId: "1:43966193922:web:667acb5cf50e29768d621b",
    measurementId: "G-W8JFZ4RJCC"
};

// تهيئة Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let activeUserType = '';
let currentGeneratedOtp = null;
let currentPhoneNumber = '';

// تفعيل التنقل بين خانات الـ OTP
document.addEventListener('DOMContentLoaded', () => {
    setupOtpFields();
});

function setupOtpFields() {
    const otpFields = document.querySelectorAll('.otp-field');

    otpFields.forEach((field, index) => {
        field.addEventListener('input', (e) => {
            const value = e.target.value;
            if (value && index < otpFields.length - 1) {
                otpFields[index + 1].focus();
            }
        });

        field.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !field.value && index > 0) {
                otpFields[index - 1].focus();
            }
        });
    });
}

// إرسال الرمز عبر سيرفر البايثون المنشور على Render
window.sendOtp = async function (userType) {
    activeUserType = userType;
    const phoneInput = document.getElementById('phone-number').value.trim();

    if (!phoneInput) {
        alert('الرجاء إدخال رقم الهاتف أولاً');
        return;
    }

    let cleanPhone = phoneInput;
    if (cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.substring(1);
    }
    const targetPhoneNumber = "+213" + cleanPhone;
    currentPhoneNumber = targetPhoneNumber;

    // توليد رمز عشوائي مكون من 6 أرقام
    currentGeneratedOtp = Math.floor(100000 + Math.random() * 900000).toString();

    const btn = document.getElementById('send-otp-btn');
    btn.disabled = true;
    btn.innerText = 'جاري إرسال الرمز...';

    try {
        // الاتصال بسيرفر البايثون على Render
        const response = await fetch('https://tassiligo.onrender.com/send-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                phone: targetPhoneNumber,
                otp: currentGeneratedOtp
            })
        });

        const resData = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error("❌ Render Server Error:", resData);
            alert("فشل إرسال الرمز عبر السيرفر.");
        } else {
            console.log("✅ تم إرسال الرسالة بنجاح عبر Render:", resData);

            // فتح نافذة إدخال الرمز بعد نجاح الإرسال
            const otpFields = document.querySelectorAll('.otp-field');
            otpFields.forEach(f => f.value = '');

            const modal = document.getElementById('otp-modal');
            if (modal) modal.style.display = 'flex';
            if (otpFields.length > 0) otpFields[0].focus();
        }

    } catch (error) {
        console.error("❌ Connection Error:", error);
        alert("حدث خطأ في الاتصال بالخادم.");
    } finally {
        btn.disabled = false;
        btn.innerText = 'إرسال رمز التحقق';
    }
};

// التحقق من الرمز المدخل
window.verifyOtp = async function () {
    const otpFields = document.querySelectorAll('.otp-field');
    let userEnteredCode = '';
    otpFields.forEach(field => {
        userEnteredCode += field.value.trim();
    });

    if (userEnteredCode.length < 6) {
        alert('الرجاء إدخال الرموز الـ 6 كاملة.');
        return;
    }

    if (!currentGeneratedOtp) {
        alert('يرجى طلب الرمز أولاً.');
        return;
    }

    if (userEnteredCode === currentGeneratedOtp) {
        const customUid = "user_" + currentPhoneNumber.replace('+', '');

        if (activeUserType === 'driver') {
            await saveDriverProfile(customUid, currentPhoneNumber);
        } else if (activeUserType === 'client') {
            await saveClientProfile(customUid, currentPhoneNumber);
        }
    } else {
        alert('رمز التحقق غير صحيح، يرجى إعادة المحاولة.');
    }
};

// حفظ بيانات السائق في Firestore
async function saveDriverProfile(uid, phone) {
    try {
        localStorage.setItem('userPhone', phone);

        const driverData = {
            uid: uid,
            phone: phone,
            role: "driver",
            is_approved: false,
            wallet_balance: 0,
            rating: 5.0,
            completion_rate: 100,
            created_at: serverTimestamp()
        };
        await setDoc(doc(db, 'drivers', uid), driverData, { merge: true });
        window.location.href = "driverdash.html";
    } catch (error) {
        alert('حدث خطأ أثناء حفظ البيانات.');
    }
}

// حفظ بيانات الزبون في Firestore
async function saveClientProfile(uid, phone) {
    try {
        localStorage.setItem('userPhone', phone);

        const clientData = {
            uid: uid,
            phone: phone,
            role: "client",
            wallet_balance: 0,
            created_at: serverTimestamp()
        };
        await setDoc(doc(db, 'clients', uid), clientData, { merge: true });
        window.location.href = "cleant-home.html";
    } catch (error) {
        alert('حدث خطأ أثناء حفظ البيانات.');
    }
}

// إغلاق المودال
window.closeOtpModal = function () {
    document.getElementById('otp-modal').style.display = 'none';
};