# Website luyện gõ phím (việt)

Chức năng:
- Thêm tài liệu muốn gõ.
- Chọn tài liệu để luyện gõ.
- Gõ và xem điểm: Accuracy, WPM, Errors (tính trực tiếp và có API chấm điểm).

## Chạy dự án

Yêu cầu: Node.js 18+

Cài và chạy:

```powershell
npm install
npm run dev
```

Mở trình duyệt: http://localhost:3000

## Ghi chú
- Dữ liệu tài liệu lưu ở `data/docs.json` (file JSON cục bộ).
- Logic tính điểm đơn giản: so sánh từng ký tự, WPM = (ký tự/5)/phút, Net WPM trừ lỗi.
- Bạn có thể cải tiến thêm: highlight con trỏ, giới hạn thời gian, cấu hình bài, lưu lịch sử điểm theo người dùng, auth, v.v.

## Triển khai lên web

Tuỳ chọn A: Deploy cả frontend + backend trên Render
1. Tạo repo GitHub và đẩy code này lên.
2. Vào https://dashboard.render.com -> New -> Web Service -> kết nối repo.
3. Cấu hình:
	- Runtime: Node
	- Build Command: `npm install`
	- Start Command: `node server.js`
	- Env var: NODE_VERSION=20
4. Deploy xong, bạn sẽ có URL, ví dụ: https://webluyengophim.onrender.com

Tuỳ chọn B: Frontend trên GitHub Pages, Backend trên Render
1. Làm bước 1–4 của Render để có API URL.
2. Bật GitHub Pages cho branch chứa thư mục `public` (ví dụ dùng GitHub Pages Actions hoặc chuyển nội dung `public` sang nhánh gh-pages).
3. Mở trang GitHub Pages, vào phần "Cấu hình API" ở trang chủ, nhập API Base URL (ví dụ URL của Render) và Lưu.
	- App sẽ lưu vào localStorage `API_BASE` để gọi API cross-origin (đã bật CORS).
