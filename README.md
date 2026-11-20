# OXU dars jadvali API

Node.js, Express va MongoDB Atlas asosidagi admin, o‘qituvchi va talaba panellari uchun API.

## Ishga tushirish

1. Backend papkasida `npm install` bajaring.
2. `.env.example` faylidan `.env` yarating va MongoDB Atlas connection string, tasodifiy uzun `JWT_SECRET` hamda boshlang‘ich admin email/parolini kiriting. `MONGODB_URI` o‘rniga mavjud `DATABASE_URL` ham ishlaydi.
3. Ixtiyoriy Telegram bot uchun `TELEGRAM_BOT_TOKEN` va HTTPS saytingiz manzili bo‘lgan `TELEGRAM_WEB_APP_URL` ni faqat backend papkasidagi `.env` fayliga kiriting.
4. `npm run dev` bilan backendni ishga tushiring. API, Socket.IO realtime xizmati va sozlangan Telegraf bot bitta Node.js backend jarayonida ishlaydi.
5. Frontend papkasida `npm run dev` bajaring. Vite `/auth`, `/academic-structure`, `/telegram`, `/teacher-availability`, `/users`, `/groups`, `/subjects`, `/lessons`, `/buildings`, `/rooms`, `/socket.io` va `/health` so‘rovlarini backendga proxy qiladi; brauzer va backend orasida CORS preflight talab qilinmaydi.

Realtime ulanish JWT orqali tasdiqlanadi. Dars jadvali o‘zgarganda tegishli admin, o‘qituvchi va guruh talabalari; davomat saqlanganda tegishli o‘qituvchi va talabalar; band vaqt o‘zgarganda o‘qituvchi va adminlar; xona/binolar o‘zgarganda adminlar xabardor qilinadi. Socket xabarlari faqat qaysi ma’lumotni yangilash signalini beradi — mijoz ma’lumotni mavjud, ruxsat tekshiradigan API’dan qayta oladi. Ulanish tiklanganda ochiq ma’lumotlar qayta yuklanadi. Bir nechta backend nusxasi bilan deploy qilinganda Socket.IO Redis adapterini sozlash kerak; odatiy bitta backend jarayonida qo‘shimcha xizmat talab qilinmaydi.

Telegram’ga ulash uchun saytga kiring, **Profil → Telegram botga ulash** havolasini oching va botda `/start` ni tasdiqlang. Havola bir martalik va 15 daqiqadan so‘ng eskiradi. Botdagi `/menu` menyusi rolga mos jadval, band vaqt va davomat amallarini ko‘rsatadi; **OXU Web App** tugmasi mavjud saytni Telegram ichida ochadi. Telegram Web App production URL’i HTTPS domen bo‘lishi kerak.

Boshlang‘ich admin faqat `ADMIN_EMAIL` va `ADMIN_PASSWORD` ikkalasi ko‘rsatilganida yaratiladi. O‘qituvchi va talabalar akkauntlari admin panelidan qo‘shiladi; parollar bcrypt bilan xeshlanadi va qayta ko‘rsatilmaydi.

## Test bazasini to‘liq yangilash

`node scripts/resetTestDatabase.js --apply` sozlangan MongoDB bazasidagi admin akkauntlaridan tashqari barcha ma’lumotlarni o‘chirib, tranzaksiya ichida sinov ma’lumotlarini yaratadi. Bu amal mavjud davomat, darslar va Telegram bog‘lanishlarini ham o‘chiradi. Admin akkauntlar va ularning parollari saqlanadi. `.env` da `SEED_PASSWORD` kamida 8 belgili bo‘lishi kerak.

Natijada 3 yo‘nalish, 6 guruh, 10 fan, 10 o‘qituvchi va 15 talaba yaratiladi. Loginlar `teacher01@gmail.com`–`teacher10@gmail.com` va `student01@gmail.com`–`student15@gmail.com`; parol `.env` dagi `SEED_PASSWORD`. Har bir talabada bitta NB va bitta qatnashgan davomat bor. Fanlar sinov uchun 8 akademik soatga (4 para) teng: 2 soat ma’ruza, 4 soat amaliyot va 2 soat laboratoriya.

## Telegram orqali parolni tiklash

Kirish sahifasidagi «Parolni unutdingizmi?» faol va oldindan Telegramga ulangan hisobga 20 daqiqaga mo‘ljallangan bir martalik havola yuboradi. Telegram ulanmagan foydalanuvchi administratorga murojaat qiladi. Foydalanuvchi mavjudligini oshkor qilmaslik uchun so‘rovga umumiy javob qaytariladi. Parol tiklanganda eski kirish sessiyalari bekor qilinadi.

Backend `.env` faylidagi `FRONTEND_URL` tiklash havolasining boshlang‘ich manzili sifatida ishlatiladi. Vercelga joylangach uni `https://saytingiz.vercel.app` kabi ochiq HTTPS manzilga almashtiring; `localhost` telefondan kompyuteringizga ulanmaydi. Frontend production muhitida `VITE_API_ORIGIN` backendning ochiq HTTPS manzili bo‘lishi kerak. Telegram bot ishlayotgan va foydalanuvchi uni oldindan profil orqali ulagan bo‘lishi kerak.

## Demo ma’lumotlari

`.env` fayliga kamida 8 belgidan iborat `SEED_PASSWORD` kiriting, keyin `npm run seed` buyrug‘ini ishga tushiring. Seed “Ijtimoiy fanlar va texnika fakulteti”, ikki kafedra va uchta yo‘nalish, 10 ta `DEMO-G01`–`DEMO-G10` guruhi, har guruhga 5 talaba, 10 ta fan, 10 ta o‘qituvchi va 6 hafta uchun (joriy haftadan 2 hafta oldin va 3 hafta keyin) demo darslar qo‘shadi. Shuningdek, `4-bino` va `1-bino` hamda auditoriya, laboratoriya va ma’ruza zallari yaratiladi; mavjud demo darslar bo‘sh xonalarga bog‘lanadi. Guruhlar yo‘nalishlarga, o‘qituvchilar esa tegishli yo‘nalishlar va fanlarga biriktiriladi. Demo loginlar `@gmail.com` bilan tugaydi. Parollar bcrypt bilan xeshlanadi; ularni DB’dan asl holida ko‘rib bo‘lmaydi.

Demo ma’lumotlarini qayta yaratish uchun `.env`-dagi `SEED_PASSWORD`-ni ishlatib `npm run seed:reset` buyrug‘idan foydalaning. Bu faqat demo guruhlar, demo akkauntlar va ularga tegishli darslarni tozalaydi; fakultet, kafedra, yo‘nalishlar, adminlar, boshqa foydalanuvchilar va fanlarni o‘chirmaydi. Gmail email manzili oldindan demo bo‘lmagan akkauntga tegishli bo‘lsa, seed xavfsizlik uchun to‘xtaydi.

Demo o‘qituvchi email namunalari: `teacher01@gmail.com`–`teacher10@gmail.com`. Talaba email namunalari: `student01.g01@gmail.com`–`student05.g10@gmail.com`. Barcha demo akkauntlar `.env` faylida ko‘rsatilgan `SEED_PASSWORD`dan foydalanadi.

## API

- `POST /auth/login`, `GET /auth/me`, `PATCH /auth/password` — parolni yangilash uchun joriy parol va kamida 8 belgili yangi parol yuboriladi
- `GET /academic-structure` — fakultet, kafedra va yo‘nalishlar ro‘yxati. Har birida `groupCount`, `studentCount` (guruhga biriktirilgan faol talabalar), fakultetlarda `departmentCount`, fakultet va kafedralarda `directionCount` qaytadi.
- `POST /academic-structure/faculties` (`name`, `isActive?`), `/departments` (`name`, `facultyId`, `isActive?`) va `/directions` (`name`, `departmentId`, `isActive?`) — bo‘lim yaratish, faqat admin.
- `PATCH /academic-structure/:type/:id` — nom, ota bo‘lim va `isActive` holatini tahrirlash; `name` talab qilinadi, ota bo‘lim yuborilmasa mavjud bog‘lanish saqlanadi. Faqat admin.
- `DELETE /academic-structure/:type/:id` — bo‘limni o‘chirish, faqat admin. Quyi bo‘limlar yoki yo‘nalishga bog‘langan guruhlar, fanlar, o‘qituvchilar mavjud bo‘lsa `409` qaytadi; ma’lumotlar kaskad orqali o‘chirilmaydi.
- `GET /buildings?weekStart=YYYY-MM-DD&dayOfWeek=1-6&period=1-8` — faqat admin uchun binolar va xonalar ro‘yxati, tanlangan slotdagi bandlik bilan; `POST /buildings`, `PUT/DELETE /buildings/:id` — bino boshqaruvi; `POST /buildings/:buildingId/rooms`, `PUT/DELETE /rooms/:id` — xona boshqaruvi. Barcha amallar admin huquqini talab qiladi. Band darsga bog‘langan xonani yoki xonalari bor binoni o‘chirib bo‘lmaydi.
- `GET/POST /users`, `PUT /users/:id`, `PATCH /users/:id/status` — faqat admin; `role` sifatida `teacher` yoki `student`; `GET /users?page=1&limit=15` sahifalangan natija qaytaradi (`limit` 15 dan oshmaydi). O‘qituvchi hisobini yaratish va tahrirlashda `directionIds` hamda `subjectIds` massivlari bilan bir nechta yo‘nalish va fan biriktiriladi; `facultyId`, `departmentId`, `directionId` so‘rov parametrlari bilan o‘qituvchilar filtrlanadi. Hisoblar o‘chirilmaydi: `PATCH /users/:id/status` bilan `{"isActive": false}` yuborilib nofaol qilinadi, bunda barcha darslar, davomat va guruh ma’lumotlari saqlanadi
- `GET/POST /groups`, `PUT /groups/:id`, `PATCH /groups/:id/status`, `GET/POST /subjects` — yozish faqat admin; guruh yaratish/tahrirlashda `directionId` yuborilib, guruh yo‘nalishga bog‘lanadi. Guruh ham o‘chirilmaydi: nofaol guruhga (yoki nofaol o‘qituvchiga) yangi dars biriktirilmaydi, mavjud ma’lumotlar saqlanadi
- `GET/POST /lessons`, `PUT/DELETE /lessons/:id` — dars yozish faqat admin; `GET /lessons?weekStart=YYYY-MM-DD` tanlangan hafta (dushanba sanasi) darslarini qaytaradi. `facultyId`, `departmentId`, `directionId` parametrlari jadval darslarini ta’lim tuzilmasi bo‘yicha toraytiradi. `POST/PUT` ham `weekStart` maydonini talab qiladi va `roomId` orqali ro‘yxatdan o‘tgan faol xonani tanlaydi. Dars `type` maydoni bilan `lecture` (ma’ruza), `practice` (amaliyot) yoki `lab` (laboratoriya) bo‘ladi; guruhlar `groupIds` massivida yuboriladi — ma’ruzaga 2–6 ta guruh birlashtiriladi, amaliyot va laboratoriyaga aynan bitta guruh beriladi. Eski `groupId` yuborilsa ham bitta guruh sifatida qabul qilinadi
- `GET/POST /teacher-availability`, `DELETE /teacher-availability/:id` — o‘qituvchi faqat o‘z band vaqtlarini ko‘radi, qo‘shadi va bekor qiladi; admin `GET /teacher-availability?teacherIds=id1,id2&weekStart=YYYY-MM-DD` orqali jadvaldagi sariq band kataklarni ko‘radi
- `GET /attendance?date=YYYY-MM-DD`, `GET/POST /attendance/lessons/:lessonId` — faqat o‘qituvchi; davomat bir marta olinadi va qayta tahrirlanmaydi
- `GET /attendance/me` — faqat talaba; o‘z davomat tarixini dars, fan va sana bilan birga qaytaradi (eng yangi sanadan, 200 tagacha)
- `GET /telegram/me`, `POST /telegram/link-code`, `DELETE /telegram/link` — joriy OXU hisobining Telegram botga ulanish holati, 15 daqiqalik bir martalik ulash havolasi va akkauntni uzish
- `POST /auth/telegram-webapp` — faqat Telegram Web App imzolangan, muddati o‘tmagan `initData` orqali bog‘langan profilga kirish tokeni beradi
- `GET /health`

Hafta kunlari dushanbadan shanbagacha `1–6`, paralar `1–8`. Har bir dars va o‘qituvchi band vaqti `weekStart` (dushanba sanasi, `YYYY-MM-DD`) bilan bog‘langan, shuning uchun har hafta alohida saqlanadi. O‘qituvchi darsi bo‘lmagan parani band qilib belgilashi mumkin; band vaqt admin jadvalida sariq ko‘rinadi va u vaqtga dars biriktirilmaydi. Bitta guruh — qaysi o‘qituvchi yoki dars turi bo‘lishidan qat’i nazar — bir haftada bir parada faqat bitta darsda bo‘ladi: ma’ruzadagi guruhlardan biriga shu parada boshqa dars qo‘yib bo‘lmaydi. Bir xona ham haftaning ayni kuni va ayni paradasida faqat bitta darsga ajratiladi; xona nomlari registr va ketma-ket bo‘shliqlarga sezgir emas. Bu cheklov backend tekshiruvi va unikal indeks bilan ta’minlanadi. Talaba faqat o‘z guruhi jadvalini, o‘qituvchi faqat o‘z darslarini ko‘radi.
O‘qituvchi boshqa darslarda biriktirilgan fanlar bo‘yicha tanlanadi; hali darsi yo‘q o‘qituvchi birinchi darsiga istalgan fanni olishi mumkin. Davomat har bir dars va sana uchun alohida saqlanadi va sana darsning haftasiga mos bo‘lishi shart.

## Renderga joylash

Backend alohida repository ildizida bo‘lsa `render.yaml` shu joyda qoladi. Monorepository ishlatilsa Render xizmatida Root Directory sifatida `oxu_backend`ni tanlang va blueprint yo‘llarini ham shu tuzilmaga moslang.

- Runtime: Node.js 24 (`package.json`da belgilangan).
- Build Command: `npm ci --omit=dev`
- Start Command: `npm start`
- Health Check Path: `/health`
- Render `PORT`ni avtomatik beradi; server `0.0.0.0`da tinglaydi.
- Render Environment: `NODE_ENV=production`, `TRUST_PROXY=1`.

Gitga `.env.example`, `.gitignore`, `render.yaml`, `package.json` va `package-lock.json` kiradi. `.env` va haqiqiy maxfiy qiymatlar Render Environment orqali beriladi.

Majburiy qiymatlar:

| Kalit | Qiymat |
| --- | --- |
| `MONGODB_URI` | MongoDB Atlas connection string. Atlas Network Access orqali Render serveridan kirishga ruxsat bering. Tranzaksiyalar uchun replica set kerak. |
| `JWT_SECRET` | Kuchli tasodifiy secret; Blueprint avtomatik yaratadi. Qo‘lda yaratish: `openssl rand -hex 32`. |
| `FRONTEND_URL` | Haqiqiy frontend HTTPS origin, masalan `https://your-app.vercel.app`. Oxirida `/` bo‘lmasin. Bir nechta origin vergul bilan ajratiladi. |
| `ADMIN_EMAIL` | Boshlang‘ich administrator emaili. |
| `ADMIN_PASSWORD` | Boshlang‘ich administrator uchun kuchli parol. Mavjud admin parolini o‘zgartirmaydi. |
| `ADMIN_NAME` | Administrator ismi. |

Telegram kerak bo‘lsa `TELEGRAM_BOT_TOKEN` va `TELEGRAM_WEB_APP_URL`ni frontend HTTPS manzili bilan to‘ldiring. Aks holda bo‘sh qoldiring. Polling bot uchun bitta instance ishlating; bir tokenni lokal va Renderda bir vaqtda ishga tushirmang. Doimiy bot va eslatmalar kerak bo‘lsa uxlamaydigan Render instance tanlang.

Frontend hosting Environment bo‘limida `VITE_API_ORIGIN=https://YOUR-BACKEND.onrender.com`ni belgilang va frontendni qayta build/deploy qiling. Frontend originini backend `FRONTEND_URL`iga ham kiriting.

Deploydan keyin `/health` javobi, administrator login, frontend so‘rovlari va Socket.IO ulanishini tekshiring. Production bazada `seed`, `seed:reset` va reset skriptlarini ishga tushirmang.

Rasmiy hujjatlar: https://render.com/docs/deploy-node-express-app va https://render.com/docs/web-services.
