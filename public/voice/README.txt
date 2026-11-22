Giong thoai phan canh mo dau: file mp3 nam neural, MOI NHAN VAT 1 GIONG (Kokoro TTS, tao offline).
  v1/v1b/v12/v3  Bravo (Team Leader)  - bm_george     v7  Delta    - bm_lewis
  v8  Echo - am_puck     v9  Foxtrot - am_liam     v10 You - am_adam     v11 Golf - am_onyx
  v2/v2b/v2c Charlie - am_fenrir     v4a/b/c radio - am_echo (+nhieu)   v5 Suit AI - bm_daniel (+robot)   v6 Private - am_onyx (+tram)
Tao lai / doi giong / doi loi thoai: sua tools/gen-voice.py + VOICE trong src/story.ts, roi chay
  python tools/gen-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin
(Neu file thieu, game tu dung giong doc cua trinh duyet lam du phong.)

11 NHAN VAT (11 nuoc): them 4 linh moi + 5 cau thoai: v13 Hotel (am_michael) · v14 India (bm_fable) · v15 Juliet (am_eric) · v16 Kilo (am_liam) · v17 India (cau hô khi nhay).
Da tao san v13..v17 bang Kokoro (cung cach voi cac cau cu).

HỌP Ở ĐỐNG LỬA (public/voice/meet/<lính>_<ý><n>.mp3): 11 lính x 36 câu = 396 clip, MỖI LÍNH 1 GIỌNG (cùng giọng như cảnh mở đầu).
  Ý = accuse (tố cáo) · suspect (nghi ngờ) · defend (biện minh) · deflect (đổ lỗi) · shout (quát) · agree (bênh) · panic (hoảng) · mock (chế giễu + cười khẩy)
      + tiếng không lời: laugh (cười) · scream (hét) · gasp (hít hơi giật mình) · grunt (hừ).
  CẢM XÚC: Kokoro đọc phẳng, nên tools/emote.py xử lý thêm từng ý: tố cáo/quát = cao độ + ngữ điệu vống lên + gào bể tiếng; hoảng = giọng cao run + hơi thở;
  biện minh = run rẩy; chế giễu = ngữ điệu sing-song kéo dài; nghi ngờ = thấp, chậm, thì thầm. Chỉnh bảng EMO / VOCAL trong emote.py rồi thu lại.
  Giọng đọc là tiếng Anh; phụ đề trong khung thoại theo ngôn ngữ game (vi có sẵn trong src/config/meetLines.json; ngôn ngữ khác dùng khoá meet.<ý>.<n> trong gói dịch, thiếu thì hiện tiếng Anh).
  Sửa/thêm câu: sửa src/config/meetLines.json rồi chạy
    pip install kokoro-onnx soundfile praat-parselmouth scipy numpy
    python tools/gen-meet-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin
  (--only 2,5 chỉ làm lính số 2 và 5 · --intent accuse chỉ làm 1 loại). Clip thiếu -> game đọc bằng giọng trình duyệt.

PHIÊN TÒA / XỬ BẮN (public/voice/trib/<lính>_<khoá>.mp3): 11 lính x 38 câu = 418 clip, cùng giọng + lớp cảm xúc như cuộc cãi vã. Sửa lời ở src/config/tribunalLines.json rồi chạy
    python tools/gen-trib-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin
CÂU HÔ NGOÀI CHIẾN TRƯỜNG (public/voice/bark/<lính>_<slug>.mp3): hô lựu đạn, "Contact!", "It's the spy!"… 11 lính x 28 câu. Danh sách ở src/config/barkLines.json, thu lại bằng
    python tools/gen-bark-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin
=> Mỗi lính CHỈ có 1 giọng Kokoro xuyên suốt game. (Chỉ lời người chơi tự gõ trong phòng họp là đọc bằng giọng trình duyệt.)

=== ĐÓNG GÓI (audio sprite) ===
Giọng họp / phiên tòa / câu hô chiến trường KHÔNG còn là ~1.100 file lẻ: gộp thành public/voice/pack/<lính>.mp3 (11 file, mỗi lính 1 giọng) + public/voice/pack/index.json (giờ bắt đầu + độ dài từng câu).
Game nạp 11 file này 1 lần (src/meetVoice.ts: loadPack/preloadVoices) rồi cắt phát từng câu từ bộ nhớ. Các đường dẫn "voice/meet/…", "voice/trib/…", "voice/bark/…" trong code chỉ là TÊN LOGIC để tra pack.
Muốn đổi / thêm câu:  1) sửa meetLines.json / tribunalLines.json / barkLines.json
                      2) python tools/gen-meet-voice.py | gen-trib-voice.py | gen-bark-voice.py ...   (ghi clip lẻ vào voice-src/ — thư mục nguồn, không cần đưa vào bản phát hành)
                      3) python tools/pack-voice.py     (gộp lại thành pack/)
