export type Locale = 'en' | 'ar';
export const LOCALES: Locale[] = ['en', 'ar'];
export const isLocale = (value: string): value is Locale => value === 'en' || value === 'ar';

/** Every piece of interface text, in both languages. lib/i18n.test.ts fails when a text has no Arabic. */
export const TEXT = {
  brand: { en: 'Arandas Tech', ar: 'أرندس تك' },
  tagline: { en: 'Software that shops and brands run on', ar: 'برمجيات تعمل عليها المتاجر والعلامات التجارية' },
  intro: { en: 'A Flutter and Supabase studio in Amman. A white-label Flutter team for agencies, and ready products for retail, in Arabic and English.', ar: 'شركة برمجيات في عمّان. نبني أنظمة نقاط البيع وإدارة الفروع والمتاجر الإلكترونية وتطبيقات الجوال، بالعربي والإنجليزي.' },
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
  leadThanks: { en: 'Thank you. We have your message and will reply by email.', ar: 'شكراً لك. وصلتنا رسالتك وسنردّ عليك بالبريد.' },
  checkout: { en: 'Checkout', ar: 'إتمام الطلب' },
  total: { en: 'Total', ar: 'المجموع' },
  address: { en: 'Delivery address', ar: 'عنوان التوصيل' },
  continueToPayment: { en: 'Continue to payment', ar: 'تابع إلى الدفع' },
  testPayment: { en: 'Test payment', ar: 'دفع تجريبي' },
  testPaymentNote: { en: 'This is a test checkout. No money is taken.', ar: 'هذه عملية دفع تجريبية. لن يُخصم أي مبلغ.' },
  payNow: { en: 'Pay now (test)', ar: 'ادفع الآن (تجريبي)' },
  orderNumber: { en: 'Order number', ar: 'رقم الطلب' },
  lookUp: { en: 'Look up', ar: 'ابحث' },
  notFound: { en: 'No order matches that number and email address.', ar: 'لا يوجد طلب بهذا الرقم وهذا البريد.' },
  paidThanks: { en: 'Thank you. Your payment was confirmed.', ar: 'شكراً لك. تم تأكيد الدفع.' },
  demoBanner: { en: 'Demo mode: sample data and test payments only.', ar: 'وضع تجريبي: بيانات نموذجية ومدفوعات تجريبية فقط.' },
  testProduct: { en: 'Test product', ar: 'منتج تجريبي' },
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
export const pick = (text: { en: string; ar: string } | undefined, locale: Locale): string => (text ? text[locale] || text.en : '');

const EXPONENT: Record<string, number> = { JOD: 3, USD: 2, EUR: 2 };
/** "59.00 USD" or "5.000 JOD", from whole minor units. */
export function money(minor: number, currency: string): string {
  const e = EXPONENT[currency] ?? 2;
  const digits = String(Math.abs(minor)).padStart(e + 1, '0');
  return `${minor < 0 ? '-' : ''}${digits.slice(0, -e)}.${digits.slice(-e)} ${currency}`;
}
