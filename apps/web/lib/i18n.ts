export type Locale = 'en' | 'ar';
export const LOCALES: Locale[] = ['en', 'ar'];
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
  smile: { en: 'Made in Amman, one button at a time.', ar: 'صُنع في عمّان، زِرّاً بعد زِرّ.' },
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
/** "59.00 USD" or "5.000 JOD", from whole minor units. */
export function money(minor: number, currency: string): string {
  const e = EXPONENT[currency] ?? 2;
  const digits = String(Math.abs(minor)).padStart(e + 1, '0');
  return `${minor < 0 ? '-' : ''}${digits.slice(0, -e)}.${digits.slice(-e)} ${currency}`;
}
