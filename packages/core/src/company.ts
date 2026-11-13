import { type Db, json } from './lib/db';
import type { Localized } from './lib/types';

/**
 * What Zirr sells today, taken from the company's public website on 11 November 2026 and renamed with the Zirr rebrand
 * of 12 November 2026 (blueprint 1.2 and 3).
 * The English and Arabic wording is the company's own published text, except where a comment says "new wording".
 *
 * In a real installation everything arrives as a draft for the owner to approve. In demo mode it arrives approved and
 * published, with a demo owner, a test product and one standing rule, so that the whole loop can be exercised.
 */

export const DEMO_OWNER_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_SUPPLIER_ID = '00000000-0000-4000-8000-0000000000a1';

const t = (en: string, ar: string): Localized => ({ en, ar });

const PACKAGES = [
  {
    id: 'project',
    sort: 1,
    name: t('Project', 'مشروع'),
    outcome: t('A defined app, quoted once, delivered in sprints.', 'تطبيق محدّد، بسعر واحد، يُسلَّم على مراحل.'),
    audience: t('Agencies and businesses that need a defined app', 'الوكالات والشركات التي تحتاج تطبيقاً محدّداً'),
    deliverables: [
      t('A written scope and a fixed quote', 'نطاق عمل مكتوب وسعر ثابت'),
      t('A demo on a test link every week', 'عرض على رابط تجريبي كل أسبوع'),
      t('Store builds, source code and docs at handover', 'إصدارات المتاجر والكود والوثائق عند التسليم'),
      t('30 days of fixes after launch', '30 يوماً من الإصلاحات بعد الإطلاق'),
    ],
    price_kind: 'fixed_quote',
    delivery: { estimate_working_days: 2 },
    support_terms: { fixes_days: 30 },
    to_confirm: ['revision limit', 'payment schedule', 'acceptance criteria'],
  },
  {
    id: 'monthly-team',
    sort: 2,
    name: t('Monthly team', 'فريق شهري'),
    outcome: t('Reserved Flutter days every month for your agency’s pipeline.', 'أيام Flutter محجوزة لوكالتك كل شهر لمشاريعها القادمة.'),
    audience: t('Agencies with a steady pipeline', 'الوكالات التي لديها مشاريع متواصلة'),
    deliverables: [
      t('Days reserved for you each month', 'أيام محجوزة لك كل شهر'),
      t('Work on any of your clients’ apps', 'عمل على أي تطبيق من تطبيقات عملائك'),
      t('A shared board and a weekly call', 'لوحة مهام مشتركة ومكالمة أسبوعية'),
      t('Cancel with a month’s notice', 'إلغاء بإشعار قبل شهر'),
    ],
    price_kind: 'monthly',
    delivery: {},
    support_terms: { cancel_notice_days: 30 },
    to_confirm: ['minimum days', 'what happens to unused days'],
  },
  {
    id: 'review-and-rescue',
    sort: 3,
    name: t('Review and rescue', 'مراجعة وإنقاذ'),
    outcome: t('An audit of a Flutter app that is late, slow or hard to change.', 'تدقيق لتطبيق Flutter متأخر أو بطيء أو صعب التعديل.'),
    audience: t('Teams whose Flutter app is late, slow or hard to change', 'الفرق التي تأخّر تطبيقها أو صار بطيئاً أو صعب التعديل'),
    deliverables: [
      t('A written report in five working days', 'تقرير مكتوب خلال خمسة أيام عمل'),
      t('Lints, tests, security and architecture', 'جودة الكود والاختبارات والأمان والبنية'),
      t('A plan, in order, to fix what matters', 'خطة مرتّبة لإصلاح ما يهمّ أولاً'),
      t('Optional: we do the fixes', 'اختياري: نحن ننفّذ الإصلاحات'),
    ],
    price_kind: 'fixed_quote',
    delivery: { report_working_days: 5 },
    support_terms: {},
    to_confirm: ['size limit per audit', 'price tiers'],
  },
  {
    id: 'done-for-you-store',
    sort: 4,
    name: t('Done for you', 'نجهّزه لك'),
    outcome: t('For fashion sellers in Jordan and the Gulf.', 'لبائعي الأزياء في الأردن والخليج.'),
    audience: t('Fashion sellers in Jordan and the Gulf', 'بائعو الأزياء في الأردن والخليج'),
    deliverables: [
      t('Your products, logo and web address', 'منتجاتك وشعارك وعنوان موقعك'),
      t('Online shop, stock and orders ready to use', 'متجر إلكتروني ومخزون وطلبات جاهزة للاستخدام'),
      t('Hosting, updates and support included', 'الاستضافة والتحديثات والدعم مشمولة'),
    ],
    price_kind: 'monthly',
    delivery: {},
    support_terms: { included: true },
    to_confirm: ['service levels', 'contract term'],
  },
  {
    id: 'zirr-pos-installation',
    sort: 5,
    name: t('Zirr POS installation', 'تركيب زِرّ كاشير'),
    // Arabic here is new wording, based on the company's Arabic profile text. For the owner to review.
    outcome: t('A point of sale for shops, cafés and restaurants, installed for you in Amman after a 14-day free trial.', 'نظام كاشير للمطاعم والكافيهات والمحلات، نركّبه عندك في عمّان مع تجربة مجانية 14 يوماً.'),
    audience: t('Shops, cafés and restaurants in Amman', 'المحلات والكافيهات والمطاعم في عمّان'),
    deliverables: [t('An installed point of sale', 'نظام كاشير مركّب وجاهز'), t('A 14-day free trial', 'تجربة مجانية 14 يوماً')],
    price_kind: 'list',
    delivery: {},
    support_terms: {},
    to_confirm: ['support terms after installation'],
  },
] as const;

const PRODUCTS = [
  {
    id: '00000000-0000-4000-8000-0000000000b1',
    slug: 'zirr-retail',
    kind: 'digital',
    name: t('Zirr Retail', 'زِرّ للتجزئة'),
    summary: t(
      'An online shop, a back office and a point of sale in one Flutter app, sold as source code you can brand and resell.',
      'متجر إلكتروني ولوحة إدارة ونقطة بيع في تطبيق Flutter واحد، يُباع ككود مصدري تضع عليه علامتك.',
    ),
    variants: [
      {
        sku: 'RETAIL-DEV',
        name: t('Developer license', 'ترخيص المطوّر'),
        summary: t('For one business you own and run.', 'لمشروع واحد تملكه وتديره.'),
        includes: [t('Full Flutter and SQL source code', 'كود Flutter وSQL المصدري كاملاً'), t('The latest version, with a license in your name', 'أحدث إصدار، مع ترخيص باسمك'), t('Setup notes and 30 days of email help', 'ملاحظات الإعداد و30 يوماً من الدعم بالبريد')],
        price_minor: 5900,
        support_days: 30,
        license_kind: 'developer',
      },
      {
        sku: 'RETAIL-AGENCY',
        name: t('Agency license', 'ترخيص الوكالة'),
        summary: t('For agencies and freelancers who build shops for clients.', 'للوكالات والمستقلين الذين يبنون متاجر لعملائهم.'),
        includes: [t('Full Flutter and SQL source code', 'كود Flutter وSQL المصدري كاملاً'), t('Set it up for a client, under your brand, and charge them', 'جهّزه لعميل باسم علامتك، وتقاضَ أجرك منه'), t('60 days of email help', '60 يوماً من الدعم بالبريد')],
        price_minor: 19900,
        support_days: 60,
        license_kind: 'agency',
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-0000000000b2',
    slug: 'zirr-boutique',
    kind: 'digital',
    name: t('Zirr Boutique', 'زِرّ بوتيك'),
    summary: t(
      'An editorial Flutter Web storefront with colour and size variants, promotion rules and Stripe checkout, and an admin panel for the team.',
      'واجهة متجر Flutter Web بطابع مجلّات الأزياء، بألوان ومقاسات وقواعد عروض ودفع عبر Stripe، ولوحة إدارة للفريق.',
    ),
    variants: [
      // The Arabic names of the two Zirr Boutique licenses are new wording. The support period is not published, so it is 0.
      { sku: 'BOUTIQUE-REGULAR', name: t('Regular license', 'الترخيص العادي'), summary: t('', ''), includes: [], price_minor: 3900, support_days: 0, license_kind: 'regular' },
      { sku: 'BOUTIQUE-EXTENDED', name: t('Extended license', 'الترخيص الموسّع'), summary: t('', ''), includes: [], price_minor: 14900, support_days: 0, license_kind: 'extended' },
    ],
  },
] as const;

const FAQS: Array<[string, Localized, Localized]> = [
  ['who-owns-the-code', t('Who owns the code?', 'من يملك الكود؟'), t('You do, for the work you pay for. Our own products (the starter, the retail app and the till) are licensed to you instead.', 'أنت، في العمل الذي تدفع ثمنه. أما منتجاتنا (القالب وزِرّ للتجزئة والكاشير) فتحصل على ترخيص لاستخدامها.')],
  ['talk-to-our-client', t('Will you talk to our client?', 'هل تتواصلون مع عميلنا؟'), t('Only if you want us to. By default we talk to you, and your client never sees our name.', 'فقط إن أردت ذلك. نتواصل معك أنت عادةً، ولا يرى عميلك اسمنا أبداً.')],
  ['time-zone', t('What time zone do you work in?', 'ما هو توقيت عملكم؟'), t('Amman, UTC+3, which overlaps the whole working day in the Gulf and most of it in Europe.', 'توقيت عمّان UTC+3، ويتقاطع مع يوم العمل كاملاً في الخليج ومعظمه في أوروبا.')],
  ['how-do-you-charge', t('How do you charge?', 'كيف تحسبون الأسعار؟'), t('A fixed price per project, or a monthly fee for reserved days. Ask on WhatsApp for current rates.', 'سعر ثابت لكل مشروع، أو رسوم شهرية لأيام محجوزة. اسألنا على واتساب عن الأسعار الحالية.')],
  ['only-flutter', t('Do you only do Flutter?', 'هل تعملون بـ Flutter فقط؟'), t('Flutter and Supabase are what we do best. We also build web apps in React and TypeScript.', 'أفضل ما نتقنه Flutter وSupabase، ونبني أيضاً تطبيقات ويب بـ React وTypeScript.')],
];

// New wording, for the owner to review before a real customer receives it.
const TEMPLATES = {
  'license-delivery': {
    title: 'License delivery email',
    en: {
      subject: 'Your Zirr license (order {{order_number}})',
      body: 'Hello {{name}},\n\nThank you for your order {{order_number}}. Your license is in your name:\n\n{{licenses}}\n\nEmail support for this license runs until: {{support_until}}.\n\nAn invitation to the source code will follow at this email address.\n\nZirr',
    },
    ar: {
      subject: 'ترخيصك من زِرّ (الطلب {{order_number}})',
      body: 'مرحباً {{name}}،\n\nشكراً لطلبك رقم {{order_number}}. هذا ترخيصك، وهو باسمك:\n\n{{licenses}}\n\nالدعم عبر البريد لهذا الترخيص مستمر حتى: {{support_until}}.\n\nستصلك دعوة إلى الكود المصدري على هذا البريد.\n\nزِرّ',
    },
  },
  'order-shipped': {
    title: 'Order shipped email',
    en: { subject: 'Your order {{order_number}} is on its way', body: 'Hello {{name}},\n\nYour order {{order_number}} has been shipped. Tracking: {{tracking}}.\n\nZirr' },
    ar: { subject: 'طلبك رقم {{order_number}} في الطريق', body: 'مرحباً {{name}}،\n\nتم شحن طلبك رقم {{order_number}}. رقم التتبّع: {{tracking}}.\n\nزِرّ' },
  },
} as const;

export async function seedCompany(db: Db, options: { demo: boolean; now: Date }): Promise<void> {
  const { demo, now } = options;
  const source = 'Company website and GitHub profile, 11 November 2026';

  for (const p of PACKAGES) {
    await db.query(
      `insert into service_packages (id, name, outcome, audience, deliverables, delivery, price_kind, support_terms, to_confirm, status, sort)
       values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10, $11) on conflict (id) do nothing`,
      [p.id, json(p.name), json(p.outcome), json(p.audience), json(p.deliverables), json(p.delivery), p.price_kind, json(p.support_terms), json(p.to_confirm), demo ? 'approved' : 'draft', p.sort],
    );
  }

  for (const product of PRODUCTS) {
    await db.query(
      `insert into products (id, slug, kind, name, summary, status, published_at) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7) on conflict (slug) do nothing`,
      [product.id, product.slug, product.kind, json(product.name), json(product.summary), demo ? 'published' : 'draft', demo ? now : null],
    );
    for (const [index, v] of product.variants.entries()) {
      await db.query(
        `insert into product_variants (product_id, sku, name, summary, includes, price_minor, currency, support_days, license_kind, sort)
         values ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, 'USD', $7, $8, $9) on conflict (sku) do nothing`,
        [product.id, v.sku, json(v.name), json(v.summary), json(v.includes), v.price_minor, v.support_days, v.license_kind, index],
      );
    }
  }

  const memory = async (key: string, kind: string, title: string, body: unknown, sensitivity = 'public'): Promise<void> => {
    await db.query(
      `insert into memory_items (key, kind, title, body, source, owner, status, sensitivity) values ($1, $2, $3, $4::jsonb, $5, 'owner', $6, $7) on conflict (key) do nothing`,
      [key, kind, title, json(body), source, demo ? 'approved' : 'draft', sensitivity],
    );
  };
  for (const [key, question, answer] of FAQS) await memory(`faq:${key}`, 'faq', question.en, { question, answer });
  for (const [key, template] of Object.entries(TEMPLATES)) await memory(`template:${key}`, 'template', template.title, { en: template.en, ar: template.ar }, 'internal');
  await memory('brand:company', 'brand', 'Who Zirr is', {
    name: t('Zirr', 'زِرّ'),
    description: t(
      'A Flutter and Supabase studio in Amman, Jordan. We build Arabic and English apps under your agency’s name, and we make our own products for shops that you can license and ship.',
      'استوديو Flutter وSupabase في عمّان. نبني تطبيقات بالعربي والإنجليزي باسم وكالتك، ونصنع منتجاتنا الخاصة لمحلات التجزئة لتشتري ترخيصها وتطلقها.',
    ),
    languages: ['en', 'ar'],
    time_zone: 'Asia/Amman',
  });

  if (!demo) return;

  await db.query(
    `insert into staff_members (user_id, email, display_name, role) values ($1, 'owner@example.test', 'Demo owner', 'owner') on conflict (user_id) do nothing`,
    [DEMO_OWNER_ID],
  );
  await db.query(`insert into suppliers (id, name, status, notes) values ($1, 'Mock supplier', 'approved', 'Exists only in demo mode.') on conflict (id) do nothing`, [DEMO_SUPPLIER_ID]);
  await db.query(
    `insert into products (id, slug, kind, name, summary, status, supplier_id, delivery_days, is_test, published_at)
     values ('00000000-0000-4000-8000-0000000000b9', 'test-physical', 'physical', $1::jsonb, $2::jsonb, 'published', $3, 3, true, $4) on conflict (slug) do nothing`,
    [json(t('Test product (physical)', 'منتج تجريبي (مادي)')), json(t('Exists only to exercise the order loop in demo mode.', 'موجود فقط لتجربة دورة الطلب في الوضع التجريبي.')), DEMO_SUPPLIER_ID, now],
  );
  await db.query(
    `insert into product_variants (product_id, sku, name, price_minor, currency, unit_cost_minor) values ('00000000-0000-4000-8000-0000000000b9', 'TEST-PHYS-1', $1::jsonb, 5000, 'JOD', 2000) on conflict (sku) do nothing`,
    [json(t('One unit', 'قطعة واحدة'))],
  );
  // The demo owner's one standing rule: deliver a license to the buyer of a paid order, from the approved template.
  const existing = await db.query(`select 1 from standing_rules where name = 'License delivery' and status = 'active'`);
  if (!existing.length) {
    await db.query(
      `insert into standing_rules (name, action_type, connector, conditions, recipient_limit_per_period, period, expires_at, created_by)
       values ('License delivery', 'gmail.send_email', 'gmail', $1::jsonb, 50, 'day', $2, $3)`,
      [json({ template: 'license-delivery', recipient: 'order_buyer' }), new Date(now.getTime() + 30 * 86_400_000), DEMO_OWNER_ID],
    );
  }
}
