export type Locale = 'en' | 'ar';
export const isLocale = (value: string): value is Locale => value === 'en' || value === 'ar';

/** Every piece of interface text, in both languages. lib/i18n.test.ts fails when a text has no Arabic. */
export const TEXT = {
  brand: { en: 'Zirr', ar: 'زِرّ' },
  // The name as the logo spells it: all lower case in English.
  wordmark: { en: 'zirr', ar: 'زِرّ' },
  tagline: {
    en: 'Flutter apps for agencies, and the products to start them from',
    ar: 'تطبيقات Flutter للوكالات، ومنتجات جاهزة تبدأ منها',
  },
  intro: {
    en: 'A Flutter and Supabase studio in Amman. We build Arabic and English apps under your agency’s name, and we make our own products for shops that you can license and ship.',
    ar: 'استوديو Flutter وSupabase في عمّان. نبني تطبيقات بالعربي والإنجليزي باسم وكالتك، ونصنع منتجاتنا الخاصة لمحلات التجزئة لتشتري ترخيصها وتطلقها.',
  },
  homeEyebrow: { en: 'Flutter studio in Amman', ar: 'استوديو Flutter في عمّان' },
  servicesEyebrow: { en: 'Work with us', ar: 'اعمل معنا' },
  productsEyebrow: { en: 'Ready to ship', ar: 'جاهزة للإطلاق' },
  services: { en: 'Services', ar: 'الخدمات' },
  products: { en: 'Source-code licenses', ar: 'تراخيص الكود المصدري' },
  includes: { en: 'What you get', ar: 'ماذا تحصل عليه' },
  askQuote: { en: 'Ask for a quote', ar: 'اطلب عرض سعر' },
  buy: { en: 'Buy', ar: 'اشترِ' },
  contact: { en: 'Contact', ar: 'تواصل معنا' },
  orderStatus: { en: 'Order status', ar: 'حالة الطلب' },
  otherLanguage: { en: 'العربية', ar: 'English' },
  name: { en: 'Your name', ar: 'اسمك' },
  email: { en: 'Email', ar: 'البريد الإلكتروني' },
  phone: { en: 'Phone (optional)', ar: 'الهاتف (اختياري)' },
  message: { en: 'What do you need?', ar: 'ماذا تحتاج؟' },
  send: { en: 'Send', ar: 'أرسل' },
  leadThanks: {
    en: 'Thank you. We have your message and will reply by email.',
    ar: 'شكراً لك. وصلتنا رسالتك وسنردّ عليك بالبريد.',
  },
  checkout: { en: 'Checkout', ar: 'إتمام الطلب' },
  total: { en: 'Total', ar: 'المجموع' },
  address: { en: 'Delivery address', ar: 'عنوان التوصيل' },
  continueToPayment: { en: 'Continue to payment', ar: 'تابع إلى الدفع' },
  unsubscribeTitle: {
    en: 'Stop the emails from Zirr?',
    ar: 'إيقاف رسائل زِرّ؟',
  },
  unsubscribeButton: { en: 'Yes, stop them', ar: 'نعم، أوقفها' },
  unsubscribed: {
    en: 'Done. You will not hear from us again. Sorry for the bother.',
    ar: 'تمّ. لن نراسلك مجدداً، ونعتذر عن الإزعاج.',
  },
  unsubscribeUnknown: {
    en: 'This link is not one we know. Reply "no thanks" to the email instead and we will stop.',
    ar: 'لا نعرف هذا الرابط. ردّ على الرسالة بكلمة «لا شكراً» وسنتوقف.',
  },
  buyOnGumroad: {
    en: 'Buy on Gumroad: card or PayPal, the file comes at once',
    ar: 'اشترِ عبر Gumroad: بالبطاقة أو PayPal، ويصلك الملف فورًا',
  },
  paymentsClosed: {
    en: 'Card payments open soon. To buy now, send us a message and we will reply by email.',
    ar: 'الدفع بالبطاقة يُفتح قريبًا. للشراء الآن، أرسل لنا رسالة وسنردّ عليك بالبريد.',
  },
  testPayment: { en: 'Test payment', ar: 'دفع تجريبي' },
  testPaymentNote: { en: 'This is a test checkout. No money is taken.', ar: 'هذه عملية دفع تجريبية. لن يُخصم أي مبلغ.' },
  payNow: { en: 'Pay now (test)', ar: 'ادفع الآن (تجريبي)' },
  cardPayment: { en: 'Pay by card', ar: 'الدفع بالبطاقة' },
  cardPaymentNote: {
    en: 'You pay on PayTabs’ secure page. Your card details never reach us.',
    ar: 'تدفع على صفحة PayTabs الآمنة. بيانات بطاقتك لا تصل إلينا أبدًا.',
  },
  goToPayment: { en: 'Go to the card page', ar: 'انتقل إلى صفحة البطاقة' },
  paymentConfirming: {
    en: 'Thank you. Your payment is being confirmed. Look your order up with your email address in a minute.',
    ar: 'شكرًا لك. يجري تأكيد دفعتك. ابحث عن طلبك ببريدك الإلكتروني بعد دقيقة.',
  },
  orderNumber: { en: 'Order number', ar: 'رقم الطلب' },
  lookUp: { en: 'Look up', ar: 'ابحث' },
  notFound: { en: 'No order matches that number and email address.', ar: 'لا يوجد طلب بهذا الرقم وهذا البريد.' },
  paidThanks: { en: 'Thank you. Your payment was confirmed.', ar: 'شكراً لك. تم تأكيد الدفع.' },
  payFailed: {
    en: 'We could not confirm the payment, so the order is not paid. Please try again from the product page.',
    ar: 'لم نتمكّن من تأكيد الدفع، لذلك لم يُدفع الطلب. يُرجى المحاولة مرة أخرى من صفحة المنتج.',
  },
  demoBanner: {
    en: 'Demo mode: sample data and test payments only.',
    ar: 'وضع تجريبي: بيانات نموذجية ومدفوعات تجريبية فقط.',
  },
  testProduct: { en: 'Test product', ar: 'منتج تجريبي' },
  // The site's sense of humour: only on the not-found page, while a page loads, the logo's secret and the footer.
  // Never on prices, payment, orders or errors. The Arabic is written as Arabic, not translated word for word.
  pageNotFound: { en: 'Page not found', ar: 'الصفحة غير موجودة' },
  lost1: { en: 'This page lost a button.', ar: 'ضاع زِرّ من هذه الصفحة.' },
  lost2: { en: 'This page went out for a coffee.', ar: 'هذه الصفحة خرجت تشرب قهوة.' },
  lost3: { en: 'We looked under every cushion. Nothing.', ar: 'بحثنا تحت كل وسادة. لا شيء.' },
  lostBody: { en: 'The link may be old, or the address mistyped.', ar: 'ربما الرابط قديم، أو في العنوان خطأ.' },
  lostButton: { en: 'The lost button', ar: 'الزِّرّ الضائع' },
  goHome: { en: 'Go to the home page', ar: 'اذهب إلى الرئيسية' },
  loading: { en: 'Loading', ar: 'جارٍ التحميل' },
  loading1: { en: 'Sewing on the buttons…', ar: 'لحظة، نخيط الأزرار…' },
  loading2: { en: 'Threading the needle…', ar: 'ندخل الخيط في الإبرة…' },
  loading3: { en: 'Warming up the coffee…', ar: 'نسخّن القهوة…' },
  secret: { en: 'Five presses! Our button says thank you.', ar: 'خمس ضغطات! زِرّنا يشكرك.' },
  privacy: { en: 'Privacy', ar: 'الخصوصية' },
  terms: { en: 'Terms', ar: 'الشروط' },
  lastUpdated: { en: 'Last updated', ar: 'آخر تحديث' },
  guides: { en: 'Guides', ar: 'أدلة' },
  guidesTitle: { en: 'Guides to our products', ar: 'أدلة منتجاتنا' },
  guidesIntro: {
    en: 'Short answers to what shop owners and agencies ask us, with the facts and the prices.',
    ar: 'إجابات قصيرة عمّا يسألنا عنه أصحاب المحلات والوكالات، مع الحقائق والأسعار.',
  },
  guidesAll: { en: 'All guides', ar: 'كل الأدلة' },
  guideNext: { en: 'Where to go next', ar: 'ماذا بعد' },
  // The free trial page for shops.
  trial: { en: 'Free trial', ar: 'تجربة مجانية' },
  trialEyebrow: { en: 'For shops, cafés and boutiques', ar: 'للمحلات والمقاهي والبوتيكات' },
  trialTitle: {
    en: 'Try the Zirr till free for {days} days',
    ar: 'جرّب كاشير زِرّ مجاناً {days} يوماً',
  },
  trialIntro: {
    en: 'A till that prints receipts in Arabic and English, keeps selling when the internet drops, and sends your JoFotara e-invoices. We set it up for you.',
    ar: 'كاشير يطبع الفواتير بالعربي والإنجليزي، ويستمر في البيع حتى لو انقطع الإنترنت، ويرسل فواتير جوفوترا عنك. ونحن نجهّزه لك.',
  },
  trialStep1: {
    en: 'Leave your details. We reply by email with a link to book a short setup call.',
    ar: 'اترك بياناتك. نرد عليك بالبريد برابط لحجز مكالمة قصيرة للتجهيز.',
  },
  trialStep2: {
    en: 'We add your products, install the till and show your staff how to use it.',
    ar: 'نضيف منتجاتك، ونركّب الكاشير، ونشرح لموظفيك طريقة استخدامه.',
  },
  trialStep3: {
    en: 'You sell on it as normal for {days} days and pay nothing. If it does not help, we take it away.',
    ar: 'تبيع عليه كالمعتاد {days} يوماً دون أن تدفع شيئاً. وإن لم يفدك نزيله.',
  },
  shopName: { en: 'Shop name', ar: 'اسم المحل' },
  businessKind: { en: 'What kind of business?', ar: 'ما نوع النشاط؟' },
  kindShop: { en: 'Shop', ar: 'محل تجاري' },
  kindCafe: { en: 'Café or restaurant', ar: 'مقهى أو مطعم' },
  kindBoutique: { en: 'Fashion boutique', ar: 'بوتيك أزياء' },
  kindOther: { en: 'Something else', ar: 'نشاط آخر' },
  city: { en: 'City', ar: 'المدينة' },
  trialNotes: { en: 'Anything we should know? (optional)', ar: 'هل هناك ما يجب أن نعرفه؟ (اختياري)' },
  trialSend: { en: 'Ask for the free trial', ar: 'اطلب التجربة المجانية' },
  trialThanks: {
    en: 'Thank you. We will email you within a day with a link to book the setup call.',
    ar: 'شكراً لك. سنراسلك خلال يوم برابط لحجز مكالمة التجهيز.',
  },
  smile: { en: 'Made in Amman, one button at a time.', ar: 'صُنع في عمّان، زِرّاً بعد زِرّ.' },
  // The home page. Every fact here is true of the products today; the figures on it come from the catalogue.
  heroTitle: {
    en: 'Flutter apps, sewn to fit agencies and shops',
    ar: 'تطبيقات Flutter، مخيّطة على مقاس الوكالات والمحلات',
  },
  // The word in the title that gets the stitch under it. It must appear in heroTitle exactly as written.
  heroMark: { en: 'sewn', ar: 'مخيّطة' },
  ctaProject: { en: 'Start a project', ar: 'ابدأ مشروعك' },
  ctaProducts: { en: 'See the products', ar: 'شاهد المنتجات' },
  factProducts: { en: 'products ready to ship', ar: 'منتجات جاهزة للإطلاق' },
  factFrom: { en: 'From {price}', ar: 'من {price}' },
  factFromLabel: { en: 'for a source-code license', ar: 'لترخيص الكود المصدري' },
  factLanguages: { en: 'AR + EN', ar: 'عربي + EN' },
  factLanguagesLabel: { en: 'on every screen, right to left too', ar: 'في كل شاشة، ومن اليمين لليسار أيضاً' },
  heroShot: { en: 'The Zirr Retail shop on a laptop and a phone', ar: 'متجر زِرّ للتجزئة على حاسوب وهاتف' },
  tickerLabel: { en: 'What we build with', ar: 'ما نبني به' },
  pauseTicker: { en: 'Pause the moving line', ar: 'أوقف الشريط المتحرك' },
  playTicker: { en: 'Play the moving line', ar: 'شغّل الشريط المتحرك' },
  tick1: { en: 'Flutter', ar: 'Flutter' },
  tick2: { en: 'Supabase', ar: 'Supabase' },
  tick3: { en: 'Arabic and English', ar: 'عربي وإنجليزي' },
  tick4: { en: 'Right to left', ar: 'من اليمين لليسار' },
  tick5: { en: 'JoFotara e-invoices', ar: 'فواتير جوفوترا' },
  tick6: { en: 'Keeps selling offline', ar: 'يبيع دون إنترنت' },
  tick7: { en: 'Source code you own', ar: 'كود مصدري تملكه' },
  tick8: { en: 'Made in Amman', ar: 'صُنع في عمّان' },
  productsTitle: { en: 'Products you can license today', ar: 'منتجات تشتري ترخيصها اليوم' },
  seeLive: { en: 'See it live', ar: 'شاهده يعمل' },
  agenciesEyebrow: { en: 'For agencies', ar: 'للوكالات' },
  agenciesTitle: {
    en: 'Your Flutter team in Amman, without the hiring',
    ar: 'فريق Flutter لوكالتك في عمّان، دون توظيف',
  },
  agenciesLead: {
    en: 'You keep the client and the name. We build the app in Flutter and Supabase, in Arabic and English, and hand you the code.',
    ar: 'يبقى العميل والاسم لك. نبني التطبيق بـFlutter وSupabase، بالعربي والإنجليزي، ونسلّمك الكود.',
  },
  step1Title: { en: 'Send the brief', ar: 'أرسل الفكرة' },
  step1Body: {
    en: 'Screens, a Figma file or a voice note. We reply with a plan and a quote.',
    ar: 'شاشات أو ملف Figma أو حتى رسالة صوتية. نردّ عليك بخطة وعرض سعر.',
  },
  step2Title: { en: 'We build it under your name', ar: 'نبنيه باسم وكالتك' },
  step2Body: {
    en: 'Builds you can show your client as it grows, with no Zirr logo anywhere.',
    ar: 'نسخ تعرضها على عميلك أولاً بأول، دون شعار زِرّ في أي مكان.',
  },
  step3Title: { en: 'You ship it and own the code', ar: 'تطلقه والكود ملكك' },
  step3Body: {
    en: 'The source code, the database and the setup notes are yours to keep.',
    ar: 'الكود المصدري وقاعدة البيانات وملاحظات الإعداد كلها لك.',
  },
  agenciesCta: { en: 'Tell us about the project', ar: 'حدّثنا عن المشروع' },
  trialPoint1: { en: 'Receipts in Arabic and English', ar: 'فواتير بالعربي والإنجليزي' },
  trialPoint2: { en: 'Keeps selling when the internet drops', ar: 'يستمر في البيع إذا انقطع الإنترنت' },
  trialPoint3: { en: 'Sends your JoFotara e-invoices', ar: 'يرسل فواتير جوفوترا عنك' },
  trialShot: { en: 'The Zirr till with a basket of suits', ar: 'كاشير زِرّ وفيه سلة بدلات' },
  readGuide: { en: 'Read', ar: 'اقرأ' },
  closeTitle: { en: 'Got an app in mind? Let’s sew it together.', ar: 'عندك فكرة تطبيق؟ يلا نخيّطها سوا.' },
  closeLead: {
    en: 'Tell us what it should do and who it is for. We reply by email.',
    ar: 'أخبرنا ماذا يفعل ولمن هو. ونردّ عليك بالبريد.',
  },
  footerAbout: {
    en: 'A Flutter and Supabase studio in Amman, Jordan.',
    ar: 'استوديو Flutter وSupabase في عمّان، الأردن.',
  },
  footerStudio: { en: 'Studio', ar: 'الاستوديو' },
  footerLegal: { en: 'The small print', ar: 'التفاصيل الصغيرة' },
  menu: { en: 'Menu', ar: 'القائمة' },
  navProducts: { en: 'Products', ar: 'المنتجات' },
  contactEyebrow: { en: 'Say hello', ar: 'قل مرحباً' },
  contactTitle: { en: 'Tell us about your app', ar: 'حدّثنا عن تطبيقك' },
  contactLead: {
    en: 'A few lines are enough: what it should do, who it is for, and when you need it. We reply by email.',
    ar: 'تكفي بضعة أسطر: ماذا يفعل، ولمن، ومتى تحتاجه. ونردّ عليك بالبريد.',
  },
  contactNext: { en: 'What happens next', ar: 'ماذا يحدث بعدها' },
  // Proposals and invoices a client opens from an email.
  proposal: { en: 'Proposal', ar: 'عرض السعر' },
  preparedFor: { en: 'Prepared for', ar: 'مُعدّ لـ' },
  validUntil: { en: 'Valid until', ar: 'ساري حتى' },
  depositOnAccept: { en: 'Invoiced when you accept', ar: 'يُفوتر عند الموافقة' },
  notes: { en: 'Notes', ar: 'ملاحظات' },
  acceptName: { en: 'Type your full name to accept', ar: 'اكتب اسمك الكامل للموافقة' },
  acceptProposal: { en: 'Accept the proposal', ar: 'وافق على العرض' },
  declineProposal: { en: 'Decline', ar: 'اعتذر عن العرض' },
  declineReason: { en: 'What would make it work? (optional)', ar: 'ما الذي يجعله مناسباً؟ (اختياري)' },
  acceptedThanks: {
    en: 'Thank you. The proposal is accepted, and your invoice is on its way by email.',
    ar: 'شكراً لك. تمت الموافقة على العرض، وستصلك الفاتورة بالبريد.',
  },
  declinedThanks: { en: 'Thank you for telling us. We will be in touch.', ar: 'شكراً لإخبارنا. سنتواصل معك.' },
  proposal_accepted: { en: 'This proposal is accepted.', ar: 'تمت الموافقة على هذا العرض.' },
  proposal_declined: { en: 'This proposal was declined.', ar: 'تم الاعتذار عن هذا العرض.' },
  proposal_expired: {
    en: 'This proposal has expired. Reply to our email and we will send a new one.',
    ar: 'انتهت صلاحية هذا العرض. ردّ على رسالتنا وسنرسل لك عرضاً جديداً.',
  },
  invoice: { en: 'Invoice', ar: 'فاتورة' },
  billedTo: { en: 'Billed to', ar: 'إلى' },
  dueOn: { en: 'Due on', ar: 'تاريخ الاستحقاق' },
  howToPay: { en: 'How to pay', ar: 'طريقة الدفع' },
  howToPayAsk: {
    en: 'Reply to the invoice email and we will send you the bank transfer details.',
    ar: 'ردّ على رسالة الفاتورة وسنرسل لك تفاصيل التحويل البنكي.',
  },
  payReference: { en: 'Please write the invoice number with your payment.', ar: 'يُرجى كتابة رقم الفاتورة مع الدفعة.' },
  invoicePaid: { en: 'Paid. Thank you.', ar: 'مدفوعة. شكراً لك.' },
  invoiceVoid: { en: 'This invoice was cancelled.', ar: 'تم إلغاء هذه الفاتورة.' },
  linkNotFound: {
    en: 'This link does not work. Reply to our email and we will help.',
    ar: 'هذا الرابط لا يعمل. ردّ على رسالتنا وسنساعدك.',
  },
  status_pending_payment: { en: 'Waiting for payment', ar: 'بانتظار الدفع' },
  status_paid: { en: 'Paid', ar: 'مدفوع' },
  status_on_hold: { en: 'Being reviewed', ar: 'قيد المراجعة' },
  status_fulfilling: { en: 'Being prepared', ar: 'قيد التجهيز' },
  status_shipped: { en: 'Shipped', ar: 'تم الشحن' },
  status_delivered: { en: 'Delivered', ar: 'تم التسليم' },
  status_completed: { en: 'Completed', ar: 'مكتمل' },
  status_return_requested: { en: 'Return requested', ar: 'طلب إرجاع' },
  status_canceled: { en: 'Canceled', ar: 'ملغى' },
  status_refunded: { en: 'Refunded', ar: 'تم ردّ المبلغ' },
  status_expired: { en: 'Expired', ar: 'منتهي' },
} as const;

export type TextKey = keyof typeof TEXT;
export const t = (key: TextKey, locale: Locale): string => TEXT[key][locale];
export const pick = (text: { en: string; ar: string } | undefined, locale: Locale): string =>
  text ? text[locale] || text.en : '';

const EXPONENT: Record<string, number> = { JOD: 3, USD: 2, EUR: 2 };
/** "59.00" or "5.000", from whole minor units. */
export function amount(minor: number, currency: string): string {
  const e = EXPONENT[currency] ?? 2;
  const digits = String(Math.abs(minor)).padStart(e + 1, '0');
  return `${minor < 0 ? '-' : ''}${digits.slice(0, -e)}.${digits.slice(-e)}`;
}

/** "59.00 USD" or "5.000 JOD", from whole minor units. */
// Wrapped in invisible left-to-right isolates (U+2066 … U+2069) so "59.00 USD" keeps its order inside Arabic text.
export const money = (minor: number, currency: string): string => `\u2066${amount(minor, currency)} ${currency}\u2069`;
