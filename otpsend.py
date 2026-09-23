from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)  # للسماح بالاتصال من الجافاسكريبت محلياً

# بيانات API الخاصة بخدمة إرسال الرسائل
API_KEY = "6749c79380e51c923697d3b4ea43aeba855c0e73bed5f2cb51873fa2985f3c54"
URL = "https://wasenderapi.com/api/send-message"

@app.route('/send-otp', methods=['POST'])
def send_otp():
    data = request.get_json()
    phone = data.get('phone')
    otp = data.get('otp')

    if not phone or not otp:
        return jsonify({"status": False, "error": "Missing phone or otp"}), 400

    # نص الرسالة
    message = f"رمز التحقق الخاص بك في منصة Tassili Go هو: {otp}"

    # إعداد Headers الخاصة بالطلب
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    # البيانات التي سيتم إرسالها إلى API
    payload = {
        "to": phone,
        "text": message
    }

    try:
        # إرسال الطلب إلى API
        response = requests.post(URL, headers=headers, json=payload)
        print("OTP has been sent to WhatsApp")
        print("Response:", response.text)
        
        return jsonify(response.json()), response.status_code
    except Exception as e:
        print("Error:", str(e))
        return jsonify({"status": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)