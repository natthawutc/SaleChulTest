const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');

const app = express();
const port = process.env.PORT || 3000;

// อนุญาตให้ GitHub Pages ส่งข้อมูลเข้ามาได้ (CORS) และตั้งรับข้อมูลแบบ JSON
app.use(cors());
app.use(express.json());
app.use(express.text()); // เผื่อกรณี Frontend ส่งมาเป็น text/plain

// ID ชีทของคุณ
const SPREADSHEET_ID = '1L6TmseqPMRBdG5hP9WvK0xZ-pgvRmwBJYVFNispHEU4';

// ตั้งค่าการเชื่อมต่อ Google Sheets โดยใช้ตัวแปรสภาพแวดล้อม (Environment Variables)
// ซึ่งเราจะไปตั้งค่าใน Server (เช่น Render) ตอนอัปโหลดเว็บ
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    // จัดการเรื่องขึ้นบรรทัดใหม่ของ Private Key ให้ถูกต้อง
    private_key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

// ==========================================
// API Endpoint (รับส่งข้อมูลแบบเดียวกับ GAS)
// ==========================================
app.post('/api', async (req, res) => {
  try {
    // ตรวจสอบว่าส่งมาเป็น string (text/plain) หรือ object (application/json)
    let params = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const action = params.action;
    let result = {};

    if (action === 'verifyLogin') {
      result = await verifyLogin(params.empId);
    } else if (action === 'searchCoupon') {
      result = await searchCouponData(params.couponCode);
    } else if (action === 'saveCoupon') {
      result = await saveCouponUsage(params.empId, params.couponCode, params.points);
    } else {
      result = { success: false, message: "Unknown action" };
    }

    res.json(result);
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ฟังก์ชันเช็คการล็อกอิน
async function verifyLogin(empId) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'DB-พนักงาน!B:B', // อ่านเฉพาะคอลัมน์ B
  });
  const rows = response.data.values;
  
  if (rows && rows.length) {
    // ข้ามแถวแรก (Header)
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === empId) {
        return { success: true, message: "เข้าสู่ระบบสำเร็จ" };
      }
    }
  }
  return { success: false, message: "ไม่พบรหัสพนักงานนี้ในระบบ" };
}

// ฟังก์ชันค้นหาคูปอง
async function searchCouponData(couponCode) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'App-02!A:F', // ดึงข้อมูล A ถึง F
  });
  const rows = response.data.values;

  if (rows && rows.length) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === couponCode) { // คอลัมน์ B (index 1)
        return {
          found: true,
          name: rows[i][2], // คอลัมน์ C
          points: rows[i][3], // คอลัมน์ D
          image: convertDriveUrl(rows[i][4]), // คอลัมน์ E
          expiry: rows[i][5] // คอลัมน์ F
        };
      }
    }
  }
  return { found: false, message: "ไม่พบรหัสคูปองนี้" };
}

// ฟังก์ชันบันทึกการแลกคูปอง
async function saveCouponUsage(empId, couponCode, points) {
  // สร้าง Timestamp เวลาไทย
  const now = new Date();
  const options = { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const timestamp = now.toLocaleString('en-GB', options).replace(',', ''); // รูปแบบ DD/MM/YYYY HH:MM:SS

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'DB-ประวัติรับคูปอง!A:D',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[timestamp, empId, couponCode, points]]
    }
  });

  return { success: true };
}

// แปลงลิงก์รูป
function convertDriveUrl(url) {
  if (!url) return '';
  const match = url.match(/[-\w]{25,}/);
  if (match) {
    return 'https://drive.google.com/thumbnail?id=' + match[0] + '&sz=w500';
  }
  return url;
}

// เริ่มรันเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`Node.js Server is running on port ${port}`);
});
